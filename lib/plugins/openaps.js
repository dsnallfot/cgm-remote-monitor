'use strict';

var _ = require('lodash');
var times = require('../times');
var consts = require('../constants');

// var ALL_STATUS_FIELDS = ['status-symbol', 'status-label', 'iob', 'meal-assist', 'freq', 'rssi']; Unused variable

function init (ctx) {
  var moment = ctx.moment;
  var utils = require('../utils')(ctx);
  var openaps = {
    name: 'openaps'
    , label: 'iAPS'
    , pluginType: 'pill-status'
  };
  var translate = ctx.language.translate;
  var firstPrefs = true;
  var levels = ctx.levels;

  openaps.getClientPrefs = function getClientPrefs() {
    return ([{
      label: "Color prediction lines",
      id: "colorPredictionLines",
      type: "boolean"
    }]);
  }

  openaps.getPrefs = function getPrefs (sbx) {

    function cleanList (value) {
      return decodeURIComponent(value || '').toLowerCase().split(' ');
    }

    function isEmpty (list) {
      return _.isEmpty(list) || _.isEmpty(list[0]);
    }

    const settings = sbx.extendedSettings || {};

    var fields = cleanList(settings.fields);
    fields = isEmpty(fields) ? ['status-symbol', 'status-label', 'iob', 'meal-assist', 'rssi'] : fields;

    var retroFields = cleanList(settings.retroFields);
    retroFields = isEmpty(retroFields) ? ['status-symbol', 'status-label', 'iob', 'meal-assist', 'rssi'] : retroFields;

    if (typeof settings.colorPredictionLines == 'undefined') {
      settings.colorPredictionLines = true;
    }

    var prefs = {
      fields: fields
      , retroFields: retroFields
      , warn: settings.warn ? settings.warn : 30
      , urgent: settings.urgent ? settings.urgent : 60
      , enableAlerts: settings.enableAlerts
      , predIOBColor: settings.predIobColor ? settings.predIobColor : '#1e88e5'
      , predCOBColor: settings.predCobColor ? settings.predCobColor : '#FB8C00'
      , predACOBColor: settings.predAcobColor ? settings.predAcobColor : '#FB8C00'
      , predZTColor: settings.predZtColor ? settings.predZtColor : '#00d2d2'
      , predUAMColor: settings.predUamColor ? settings.predUamColor : '#c9bd60'
      , colorPredictionLines: settings.colorPredictionLines
    };

    if (firstPrefs) {
      firstPrefs = false;
    }

    return prefs;
  };

  openaps.setProperties = function setProperties (sbx) {
    sbx.offerProperty('openaps', function setOpenAPS () {
      return openaps.analyzeData(sbx);
    });
  };

  openaps.analyzeData = function analyzeData (sbx) {
    var recentHours = 6; //TODO dia*2
    var recentMills = sbx.time - times.hours(recentHours).msecs;

    var recentData = _.chain(sbx.data.devicestatus)
      .filter(function(status) {
        return ('openaps' in status) && sbx.entryMills(status) <= sbx.time && sbx.entryMills(status) >= recentMills;
      })
      .map(function(status) {
        if (status.openaps && _.isArray(status.openaps.iob) && status.openaps.iob.length > 0) {
          status.openaps.iob = status.openaps.iob[0];
          if (status.openaps.iob.time) {
            status.openaps.iob.timestamp = status.openaps.iob.time;
          }
        }
        return status;
      })
      .value();

    var prefs = openaps.getPrefs(sbx);
    var recent = moment(sbx.time).subtract(prefs.warn / 2, 'minutes');

    var result = {
      seenDevices: {}
      , lastEnacted: null
      , lastNotEnacted: null
      , lastSuggested: null
      , lastIOB: null
      , lastMMTune: null
      , lastPredBGs: null
    };

    function getDevice (status) {
      var uri = status.device || 'device';
      var device = result.seenDevices[uri];

      if (!device) {
        device = {
          name: utils.deviceName(uri)
          , uri: uri
        };

        result.seenDevices[uri] = device;
      }
      return device;
    }

    function toMoments (status) {
      var enacted = false;
      var notEnacted = false;
      if (status.openaps.enacted && status.openaps.enacted.timestamp && (status.openaps.enacted.recieved || status.openaps.enacted.received)) {
        if (status.openaps.enacted.mills) {
          enacted = moment(status.openaps.enacted.mills);
        } else {
          enacted = moment(status.openaps.enacted.timestamp);
        }
      } else if (status.openaps.enacted && status.openaps.enacted.timestamp && !(status.openaps.enacted.recieved || status.openaps.enacted.received)) {
        if (status.openaps.enacted.mills) {
          notEnacted = moment(status.openaps.enacted.mills)
        } else {
          notEnacted = moment(status.openaps.enacted.timestamp)
        }
      }

      var suggested = false;
      if (status.openaps.suggested && status.openaps.suggested.mills) {
        suggested = moment(status.openaps.suggested.mills);
      } else if (status.openaps.suggested && status.openaps.suggested.timestamp) {
        suggested = moment(status.openaps.suggested.timestamp);
      }

      var iob = false;
      if (status.openaps.iob && status.openaps.iob.mills) {
        iob = moment(status.openaps.iob.mills);
      } else if (status.openaps.iob && status.openaps.iob.timestamp) {
        iob = moment(status.openaps.iob.timestamp);
      }

      return {
        when: moment(status.mills)
        , enacted
        , notEnacted
        , suggested
        , iob
      };
    }

    function momentsToLoopStatus (moments, noWarning) {

      var status = {
        symbol: ' ⚠ '
        , code: 'warning'
        , label: 'Varning'
      };

      if (moments.notEnacted && (
          (moments.enacted && moments.notEnacted.isAfter(moments.enacted)) || (!moments.enacted && moments.notEnacted.isAfter(recent)))) {
        status.symbol = ' x ';
        status.code = 'notenacted';
        status.label = 'Ej utfört';
      } else if (moments.enacted && moments.enacted.isAfter(recent)) {
        status.symbol = ' ⌁ ';
        status.code = 'enacted';
        status.label = 'Utfört';
      } else if (moments.suggested && moments.suggested.isAfter(recent)) {
        status.symbol = ' ↻ ';
        status.code = 'looping';
        status.label = 'Förslag';
      } else if (moments.when && (noWarning || moments.when.isAfter(recent))) {
        status.symbol = ' ◉ ';
        status.code = 'waiting';
        status.label = 'Väntar...';
      }

      return status;
    }
_.forEach(recentData, function eachStatus (status) {
      var device = getDevice(status);

      var moments = toMoments(status);
      var loopStatus = momentsToLoopStatus(moments, true);

      if (!device.status || moments.when.isAfter(device.status.when)) {
        device.status = loopStatus;
        device.status.when = moments.when;
      }

      var enacted = status.openaps && status.openaps.enacted;
      if (enacted && moments.enacted && (!result.lastEnacted || moments.enacted.isAfter(result.lastEnacted.moment))) {
        if (enacted.mills) {
          enacted.moment = moment(enacted.mills);
        } else {
          enacted.moment = moment(enacted.timestamp);
        }
        result.lastEnacted = enacted;
        if (enacted.predBGs && (!result.lastPredBGs || enacted.moment.isAfter(result.lastPredBGs.moment))) {
          result.lastPredBGs = _.isArray(enacted.predBGs) ? { values: enacted.predBGs } : enacted.predBGs;
          result.lastPredBGs.moment = enacted.moment;
        }
      }

      if (enacted && moments.notEnacted && (!result.lastNotEnacted || moments.notEnacted.isAfter(result.lastNotEnacted.moment))) {
        if (enacted.mills) {
          enacted.moment = moment(enacted.mills);
        } else {
          enacted.moment = moment(enacted.timestamp);
        }
        result.lastNotEnacted = enacted;
      }

      var suggested = status.openaps && status.openaps.suggested;
      if (suggested && moments.suggested && (!result.lastSuggested || moments.suggested.isAfter(result.lastSuggested.moment))) {
        if (suggested.mills) {
          suggested.moment = moment(suggested.mills);
        } else {
          suggested.moment = moment(suggested.timestamp);
        }
        result.lastSuggested = suggested;
        if (suggested.predBGs && (!result.lastPredBGs || suggested.moment.isAfter(result.lastPredBGs.moment))) {
          result.lastPredBGs = _.isArray(suggested.predBGs) ? { values: suggested.predBGs } : suggested.predBGs;
          result.lastPredBGs.moment = suggested.moment;
        }
      }

      var iob = status.openaps && status.openaps.iob;
      if (moments.iob && (!result.lastIOB || moment(iob.timestamp).isAfter(result.lastIOB.moment))) {
        iob.moment = moments.iob;
        result.lastIOB = iob;
      }

      if (status.mmtune && status.mmtune.timestamp) {
        status.mmtune.moment = moment(status.mmtune.timestamp);
        if (!device.mmtune || moments.when.isAfter(device.mmtune.moment)) {
          device.mmtune = status.mmtune;
        }
      }
    });

    if (result.lastEnacted && result.lastSuggested) {
      if (result.lastEnacted.moment.isAfter(result.lastSuggested.moment)) {
        result.lastLoopMoment = result.lastEnacted.moment;
        result.lastEventualBG = result.lastEnacted.eventualBG;
      } else {
        result.lastLoopMoment = result.lastSuggested.moment;
        result.lastEventualBG = result.lastSuggested.eventualBG;
      }
    } else if (result.lastEnacted && result.lastEnacted.moment) {
      result.lastLoopMoment = result.lastEnacted.moment;
      result.lastEventualBG = result.lastEnacted.eventualBG;
    } else if (result.lastSuggested && result.lastSuggested.moment) {
      result.lastLoopMoment = result.lastSuggested.moment;
      result.lastEventualBG = result.lastSuggested.eventualBG;
    }

    result.status = momentsToLoopStatus({
      enacted: result.lastEnacted && result.lastEnacted.moment
      , notEnacted: result.lastNotEnacted && result.lastNotEnacted.moment
      , suggested: result.lastSuggested && result.lastSuggested.moment
    }, false, recent);

    return result;
  };

  openaps.getEventTypes = function getEventTypes (sbx) {

    var units = sbx.settings.units;
    console.log('units', units);

    var reasonconf = [];

    if (units == 'mmol') {
      reasonconf.push({ name: translate('🏃🏼‍♂️ Hög aktivitet'), targetTop: 6, targetBottom: 6, duration: 60 });
      reasonconf.push({ name: translate('🍬 Efter dextro'), targetTop: 6, targetBottom: 6, duration: 60 });
      reasonconf.push({ name: translate('🍽️ Äter snart'), targetTop: 4, targetBottom: 4, duration: 60 });
      reasonconf.push({ name: translate('❌ Blocka SMB'), targetTop: 6, targetBottom: 6, duration: 480 });
      reasonconf.push({ name: translate('⏬ Extra lågt behov'), targetTop: 9.5, targetBottom: 9.5, duration: 180 });
      reasonconf.push({ name: translate('⬆️ Boost'), targetTop: 4, targetBottom: 4, duration: 120 });
      reasonconf.push({ name: translate('⚽️ Gympa'), targetTop: 6.5, targetBottom: 6.5, duration: 60 });
      reasonconf.push({ name: translate('🍬😴 Efter dextro natt'), targetTop: 6, targetBottom: 6, duration: 120 });
      reasonconf.push({ name: translate('😴 Nattläge'), targetTop: 5.7, targetBottom: 5.7, duration: 480 });

    } else {
      reasonconf.push({ name: translate('Eating Soon'), targetTop: 72, targetBottom: 72, duration: 60 });
      reasonconf.push({ name: translate('High Activity'), targetTop: 135, targetBottom: 135, duration: 60 });
      reasonconf.push({ name: translate('High Activity Prolonged'), targetTop: 135, targetBottom: 135, duration: 120 });
      reasonconf.push({ name: translate('After dextro'), targetTop: 135, targetBottom: 135, duration: 60 });
    }
    return [
      {
        val: 'Temporary Target'
        , name: 'Temporary Target'
        , bg: false
        , insulin: false
        , carbs: false
        , prebolus: false
        , duration: true
        , percent: false
        , absolute: false
        , profile: false
        , split: false
        , targets: true
        , reasons: reasonconf
      }
      , {
        val: 'Temporary Target Cancel'
        , name: 'Avbryt tillfälligt mål'
        , bg: false
        , insulin: false
        , carbs: false
        , prebolus: false
        , duration: false
        , percent: false
        , absolute: false
        , profile: false
        , split: false
      }      
      , {
        val: 'iAPS Offline'
        , name: 'iAPS Offline'
        , bg: false
        , insulin: false
        , carbs: false
        , prebolus: false
        , duration: true
        , percent: false
        , absolute: false
        , profile: false
        , split: false
      }
    ];
  };

  openaps.checkNotifications = function checkNotifications (sbx) {
    var prefs = openaps.getPrefs(sbx);

    if (!prefs.enableAlerts) { return; }

    var prop = sbx.properties.openaps;

    if (!prop.lastLoopMoment) {
      console.info('iAPS hasn\'t reported a loop yet');
      return;
    }

    var now = moment();
    var level = statusLevel(prop, prefs, sbx);
    if (level >= levels.WARN) {
      sbx.notifications.requestNotify({
        level: level
        , title: 'iAPS isn\'t looping'
        , message: 'Last Loop: ' + utils.formatAgo(prop.lastLoopMoment, now.valueOf())
        , pushoverSound: 'echo'
        , group: 'iAPS'
        , plugin: openaps
        , debug: prop
      });
    }
  };

  openaps.findOfflineMarker = function findOfflineMarker (sbx) {
    return _.findLast(sbx.data.treatments, function match (treatment) {
      var eventTime = sbx.entryMills(treatment);
      var eventEnd = treatment.duration ? eventTime + times.mins(treatment.duration).msecs : eventTime;
      return eventTime <= sbx.time && treatment.eventType === 'iAPS Offline' && eventEnd >= sbx.time;
    });
  };

  openaps.updateVisualisation = function updateVisualisation (sbx) {
    var prop = sbx.properties.openaps;

    var prefs = openaps.getPrefs(sbx);

    var selectedFields = sbx.data.inRetroMode ? prefs.retroFields : prefs.fields;

    function valueString (prefix, value) {
      return value ? prefix + value : '';
    }

    var events = [];

    //Daniel: Test line breaks instead of comma separated values for reason wall of text
    function addSuggestion() {
      if (prop.lastSuggested) {
        var bg = prop.lastSuggested.bg;
        var timestamp = prop.lastSuggested.timestamp;
        var units = sbx.data.profile.getUnits();
    
        if (units === 'mmol') {
          bg = Math.round(bg / consts.MMOL_TO_MGDL * 10) / 10;
        }
    
        // Replace all commas with line breaks        
        var reasonWithLineBreaks = prop.lastSuggested.reason.replace(/,/g, ' <br> • ');

        // Make "SMB INAKTIVERADE!" bold and add a line break
        reasonWithLineBreaks = reasonWithLineBreaks.replace(/SMB INAKTIVERADE!/g, '<b>SMB INAKTIVERADE!</b><br> • ');

        // Make "Mikrobolus" bold and add a line break
        reasonWithLineBreaks = reasonWithLineBreaks.replace(/Mikrobolus:/g, '<br><b>Mikrobolus:</b>');

        // Replace "E." with E+line break
        reasonWithLineBreaks = reasonWithLineBreaks.replace(/E\. /g, 'E<br>  ');

        // Replace "; " with line breaks
        reasonWithLineBreaks = reasonWithLineBreaks.replace(/; /g, ' <br> • ');
    
        // Daniel: Parse the timestamp string and convert it to local time in Stockholm timezone
        var localTime = new Date(timestamp);
        var options = {
            timeZone: 'Europe/Stockholm',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        };
        var localTimeString = localTime.toLocaleString('sv-SE', options);
        

        var valueParts = [
          valueString('iAPS ↻ Förslag (', localTimeString),
          valueString(')<br> • BG: ', bg),
          valueString('<br> • ', reasonWithLineBreaks),
          // Daniel: commented out due to duplicate info in reason , prop.lastSuggested.sensitivityRatio ? ' • <b>Sensitivity Ratio:</b> ' + (parseFloat(prop.lastSuggested.sensitivityRatio) * 100).toFixed(0) + '%' : ''
        ];
    
        /* Daniel: Commented out since IOB info is already available in IOB pill
        //if (_.includes(selectedFields, 'iob')) {
        valueParts = concatIOB(valueParts);
        //}
        */
    
        events.push({
          time: prop.lastSuggested.moment,
          value: valueParts.join('')
        });
      }
    }

    function getForecastPoints () {
      var points = [];

      function toPoints (offset, forecastType) {
        return function toPoint (value, index) {
          var colors = {
            'Values': '#ff00ff'
            , 'IOB': prefs.predIOBColor
            , 'Zero-Temp': prefs.predZTColor
            , 'COB': prefs.predCOBColor
            , 'Accel-COB': prefs.predACOBColor
            , 'UAM': prefs.predUAMColor
          }
          
          return {
            mgdl: value
            , color: prefs.colorPredictionLines ? colors[forecastType] : '#ff00ff'
            , mills: prop.lastPredBGs.moment.valueOf() + times.mins(5 * index).msecs + offset //  + times.mins(3).msecs
            , noFade: true
            , forecastType: forecastType
          };
        };
      }

      if (prop.lastPredBGs) {
        if (prop.lastPredBGs.values) {
          points = points.concat(_.map(prop.lastPredBGs.values, toPoints(0, "Values")));
        }
        if (prop.lastPredBGs.IOB) {
          points = points.concat(_.map(prop.lastPredBGs.IOB, toPoints(3333, "IOB")));
        }
        if (prop.lastPredBGs.ZT) {
          points = points.concat(_.map(prop.lastPredBGs.ZT, toPoints(4444, "Zero-Temp")));
        }
        if (prop.lastPredBGs.aCOB) {
          points = points.concat(_.map(prop.lastPredBGs.aCOB, toPoints(5555, "Accel-COB")));
        }
        if (prop.lastPredBGs.COB) {
          points = points.concat(_.map(prop.lastPredBGs.COB, toPoints(7777, "COB")));
        }
        if (prop.lastPredBGs.UAM) {
          points = points.concat(_.map(prop.lastPredBGs.UAM, toPoints(9999, "UAM")));
        }
      }

      return points;
    }

    // Daniel Test check 1: Check if the event is 'enacted' and within the last 10 seconds
if ('enacted' === prop.status.code && prop.lastEnacted.moment.isAfter(moment().subtract(10, 'seconds'))) { //Tillägget på x sek här verkar vara det som gör att predictions och device statusar alltid uppdateras samt finns tillgängliga historiskt. Dock så är det suggested som visas, Men 3 min buffert på enacted verkar göra att datat läses in och görs tillgänglig i historiken närm na scrollar i grafen
  var canceled = prop.lastEnacted.rate === 0 && prop.lastEnacted.duration === 0;
  var bg = prop.lastEnacted.bg;
  var units = sbx.data.profile.getUnits(); 

  if (units === 'mmol') {
      bg = Math.round(bg / consts.MMOL_TO_MGDL * 10) / 10;
  }

  // Replace all commas with line breaks
  var enactedReasonWithLineBreaks = prop.lastSuggested.reason.replace(/,/g, ' <br> • ');

  // Make "SMB INAKTIVERADE!" bold and add a line break
  enactedReasonWithLineBreaks = enactedReasonWithLineBreaks.replace(/SMB INAKTIVERADE!/g, '<b>SMB INAKTIVERADE!</b><br> • ');

  // Make "Mikrobolus" bold and add a line break before
  enactedReasonWithLineBreaks = enactedReasonWithLineBreaks.replace(/Mikrobolus:/g, '<br><b>Mikrobolus:</b>');

   // Replace "E." with E+line break
   enactedReasonWithLineBreaks = enactedReasonWithLineBreaks.replace(/E\. /g, 'E<br>  ');

  // Replace "; " with line breaks
  enactedReasonWithLineBreaks = enactedReasonWithLineBreaks.replace(/; /g, ' <br> • ');

  var valueParts = [
      valueString('• BG: ', bg),
      '<br> • <b>Temp Basal' + (canceled ? ' Avbruten' : ' Startad') + '</b>',
      canceled ? '' : ' ' + prop.lastEnacted.rate.toFixed(2) + 'E/h i ' + prop.lastEnacted.duration + 'm',
      valueString('<br> • ', enactedReasonWithLineBreaks),
      prop.lastEnacted.mealAssist && _.includes(selectedFields, 'meal-assist') ? '<br> • <b>Meal Assist:</b> ' + prop.lastEnacted.mealAssist : ''
  ];

  //Test to always add both addsuggestion and valueparts when suggested comes after enacted
  if (prop.lastSuggested && prop.lastSuggested.moment.isAfter(prop.lastEnacted.moment)) {
    addSuggestion();
  }
  
  //valueParts = concatIOB(valueParts); //Daniel: Commented out since IOB info is already available in IOB pill

  events.push({
    time: prop.lastEnacted.moment, 
    value: valueParts.join('')
});

} else {
    addSuggestion();
  }

    _.forIn(prop.seenDevices, function seenDevice (device) {
      var deviceInfo = [device.name];

      if (_.includes(selectedFields, 'status-symbol')) {
        deviceInfo.push(device.status.symbol);
      }

      if (_.includes(selectedFields, 'status-label')) {
        deviceInfo.push(device.status.label);
      }

      if (device.mmtune) {
        var best = _.maxBy(device.mmtune.scanDetails, function(d) {
          return d[2];
        });

        if (_.includes(selectedFields, 'freq')) {
          deviceInfo.push(device.mmtune.setFreq + 'MHz');
        }
        if (best && best.length > 2 && _.includes(selectedFields, 'rssi')) {
          deviceInfo.push('@ ' + best[2] + 'dB');
        }
      }
      events.push({
        time: device.status.when
        , value: deviceInfo.join('')
      });
    });

    var sorted = _.sortBy(events, function toMill (event) {
      return event.time.valueOf();
    }).reverse();

    var info = _.map(sorted, function eventToInfo (event) {
      return {
        label: utils.timeAt(false, sbx) + utils.timeFormat(event.time, sbx)
        , value: event.value
      };
    });

    var label = 'iAPS';
    if (_.includes(selectedFields, 'status-symbol')) {
      label += ' ' + prop.status.symbol;
    }

    sbx.pluginBase.updatePillText(openaps, {
      value: utils.timeFormat(prop.lastLoopMoment, sbx)
      , label: label
      , info: info
      , pillClass: statusClass(prop, prefs, sbx)
    });

    var forecastPoints = getForecastPoints();
    if (forecastPoints && forecastPoints.length > 0) {
      sbx.pluginBase.addForecastPoints(forecastPoints, { type: 'iaps', label: 'iAPS Forecasts' });
    }
  };

  function virtAsstForecastHandler (next, slots, sbx) {
    var lastEventualBG = _.get(sbx, 'properties.openaps.lastEventualBG');
    if (lastEventualBG) {
      var response = translate('virtAsstOpenAPSForecast', {
        params: [
          lastEventualBG
        ]
      });
      next(translate('virtAsstTitleOpenAPSForecast'), response);
    } else {
      next(translate('virtAsstTitleOpenAPSForecast'), translate('virtAsstUnknown'));
    }
  }

  function virtAsstLastLoopHandler (next, slots, sbx) {
    var lastLoopMoment = _.get(sbx, 'properties.openaps.lastLoopMoment');
    if (lastLoopMoment) {
      var response = translate('virtAsstLastLoop', {
        params: [
          moment(lastLoopMoment).from(moment(sbx.time))
        ]
      });
      next(translate('virtAsstTitleLastLoop'), response);
    } else {
      next(translate('virtAsstTitleLastLoop'), translate('virtAsstUnknown'));
    }
  }

  openaps.virtAsst = {
    intentHandlers: [{
      intent: 'MetricNow'
      , metrics: ['iaps forecast', 'forecast']
      , intentHandler: virtAsstForecastHandler
    }, {
      intent: 'LastLoop'
      , intentHandler: virtAsstLastLoopHandler
    }]
  };

  function statusClass (prop, prefs, sbx) {
    var level = statusLevel(prop, prefs, sbx);
    return levels.toStatusClass(level);
  }

  function statusLevel (prop, prefs, sbx) {
    var level = levels.NONE;
    var now = moment(sbx.time);

    if (openaps.findOfflineMarker(sbx)) {
      console.info('iAPS known offline, not checking for alerts');
    } else if (prop.lastLoopMoment) {
      var urgentTime = prop.lastLoopMoment.clone().add(prefs.urgent, 'minutes');
      var warningTime = prop.lastLoopMoment.clone().add(prefs.warn, 'minutes');

      if (urgentTime.isBefore(now)) {
        level = levels.URGENT;
      } else if (warningTime.isBefore(now)) {
        level = levels.WARN;
      }
    }

    return level;
  }

  return openaps;

}

module.exports = init;