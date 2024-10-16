'use strict';
var times = require('../times');
var consts = require('../constants');
var _ = require('lodash');

function init (ctx) {
  var moment = ctx.moment;

  var translate = ctx.language.translate;

  var basal = {
    name: 'basal'
    , label: 'Basal Profile'
    , pluginType: 'pill-status'
  };

  basal.setProperties = function setProperties (sbx) {
    if (hasRequiredInfo(sbx)) {
      var profile = sbx.data.profile;
      var current = profile.getTempBasal(sbx.time);

      var tempMark = '';
      tempMark += current.treatment ? 'T' : '';
      tempMark += current.combobolustreatment ? 'C' : '';
      tempMark += tempMark ? ': ' : '';

      sbx.offerProperty('basal', function setBasal() {
        return {
          //display: tempMark + current.totalbasal.toFixed(2) + 'E' //Daniel: commented out to Remove T: from basal pill
display: current.totalbasal.toFixed(2) + 'E/h'
          , current: current
        };
      });
    }
  };


  function hasRequiredInfo (sbx) {

    if (!sbx.data.profile) { return false; }
    
    if (!sbx.data.profile.hasData()) {
      console.warn('For the Basal plugin to function you need a treatment profile');
      return false;
    }
    
    if (!sbx.data.profile.getBasal()) {
      console.warn('For the Basal plugin to function you need a basal profile');
      return false;    
    }
    
    return true;
 }

  basal.updateVisualisation = function updateVisualisation (sbx) {
  
    if (!hasRequiredInfo(sbx)) {
      return;
    }
    
    var profile = sbx.data.profile;
    var prop = sbx.properties.basal;
    var basalValue =  prop && prop.current;
        
    var tzMessage = profile.getTimezone() ? profile.getTimezone() : 'Timezone not set in profile';
    
    var sensitivity = profile.getSensitivity(sbx.time);
    var units = profile.getUnits();

    if (sbx.settings.units != units) {
      sensitivity *= (sbx.settings.units === 'mmol' ? (consts.MMOL_TO_MGDL / 18) : consts.MMOL_TO_MGDL);

      var decimals = (sbx.settings.units === 'mmol' ? 10 : 1);

      sensitivity = Math.round(sensitivity * decimals) / decimals;
    }
    
    var info = [];
    /*var info = [{label: translate('Current basal'), value: prop.display}
      , {label: translate('Sensitivity'), value: sensitivity + ' ' + sbx.settings.units + ' / E'}
      , {label: translate('Current Carb Ratio'), value: '1 E / ' + profile.getCarbRatio(sbx.time) + 'g'}
      , {label: translate('Basal timezone'), value: tzMessage}
      //, {label: '------------------------------------------', value: ''}
      //, {label: translate('Active profile'), value: profile.activeProfileToTime(sbx.time)}
      ];*/

    var tempText, remaining;
    if (basalValue.treatment) {
      tempText = basalValue.treatment.percent ? (basalValue.treatment.percent > 0 ? '+' : '') + basalValue.treatment.percent + '%' :
        !isNaN(basalValue.treatment.absolute) ? basalValue.treatment.absolute + ' E/h' : '';
      remaining = parseInt(basalValue.treatment.duration - times.msecs(sbx.time - basalValue.treatment.mills).mins);
      //info.push({label: '------------------------------------------', value: ''});
      info.push({label: translate('Active temp basal'), value: tempText});
      info.push({label: translate('Active temp basal start'), value: new Date(basalValue.treatment.mills).toLocaleString()});
      info.push({label: translate('Active temp basal duration'), value: parseInt(basalValue.treatment.duration) + ' ' + translate('mins')});
      info.push({label: translate('Active temp basal remaining'), value: remaining + ' ' + translate('mins')});
      info.push({label: '------------------------------------------', value: ''});
      info.push({label: translate('Basal profile value'), value: basalValue.basal.toFixed(2) + ' E/h'});
    }
      
    if (basalValue.combobolustreatment) {
      tempText = (basalValue.combobolustreatment.relative ? '+' + basalValue.combobolustreatment.relative + ' E/h' : '');
      remaining = parseInt(basalValue.combobolustreatment.duration - times.msecs(sbx.time - basalValue.combobolustreatment.mills).mins);
      info.push({label: '------------------------------------------', value: ''});
      info.push({label: translate('Active combo bolus'), value: tempText});
      info.push({label: translate('Active combo bolus start'), value: new Date(basalValue.combobolustreatment.mills).toLocaleString()});
      info.push({label: translate('Active combo bolus duration'), value: parseInt(basalValue.combobolustreatment.duration) + ' ' + translate('mins')});
      info.push({label: translate('Active combo bolus remaining'), value: remaining + ' ' + translate('mins')});
    }
      
    /*sbx.pluginBase.updatePillText(basal, {
      value: prop.display + ' (' + prop.current.basal.toFixed(2) + 'E)'
      , label: translate('BASAL')
      , info: info
    });*/

    sbx.pluginBase.updatePillText(basal, {
      value: prop.current.basal.toFixed(2) + ' ⇢ ' + prop.display
      , label: translate('BASAL')
      , info: info
    });

  };

  function basalMessage(slots, sbx) {
        var basalValue = sbx.data.profile.getTempBasal(sbx.time);
        var response = translate('virtAsstUnknown');
        var pwd = _.get(slots, 'pwd.value');
        var preamble = pwd ? translate('virtAsstPreamble3person', {
            params: [
                pwd
            ]
        }) : translate('virtAsstPreamble');
        if (basalValue.treatment) {
            var minutesLeft = moment(basalValue.treatment.endmills).from(moment(sbx.time));
            response = translate('virtAsstBasalTemp', {
                params: [
                    preamble,
                    basalValue.totalbasal,
                    minutesLeft
                ]
            });
        } else {
            response = translate('virtAsstBasal', {
                params: [
                    preamble,
                    basalValue.totalbasal
                ]
            });
        }
        return response;
    }

  function virtAsstRollupCurrentBasalHandler (slots, sbx, callback) {
    callback(null, {results: basalMessage(slots, sbx), priority: 1});
  }

  function virtAsstCurrentBasalhandler (next, slots, sbx) {
    next(translate('virtAsstTitleCurrentBasal'), basalMessage(slots, sbx));
  }

  basal.virtAsst = {
    rollupHandlers: [{
      rollupGroup: 'Status'
      , rollupName: 'current basal'
      , rollupHandler: virtAsstRollupCurrentBasalHandler
    }],
    intentHandlers: [{
      intent: 'MetricNow'
      , metrics: ['basal', 'current basal']
      , intentHandler: virtAsstCurrentBasalhandler
    }]
  };

  return basal;
}

module.exports = init;
