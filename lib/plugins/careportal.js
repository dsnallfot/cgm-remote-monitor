'use strict';

function init() {

  var careportal = {
    name: 'careportal'
    , label: 'Care Portal'
    , pluginType: 'drawer'
  };

  careportal.getEventTypes = function getEventTypes () {

    //TODO: use sbx and new CAREPORTAL_EVENTTYPE_GROUPS="core temps combo dad sensor site etc"

    return [
      { val: '<none>'
        , name: '<none>'
        , bg: true, insulin: true, carbs: true, protein: false, fat: false, prebolus: false, duration: false, percent: false, absolute: false, profile: false, split: false, sensor: false
      }
      , { val: 'BG Check'
        , name: 'BG Check'
        , bg: true, insulin: false, carbs: false, protein: false, fat: false, prebolus: false, duration: false, percent: false, absolute: false, profile: false, split: false, sensor: false
      }
      , { val: 'Carb Correction'
        , name: 'Carb Correction'
        , bg: true, insulin: false, carbs: true, protein: true, fat: true, prebolus: false, duration: false, percent: false, absolute: false, profile: false, split: false, sensor: false
      }
      , { val: 'Announcement'
        , name: 'Announcement'
        , bg: true, insulin: false, carbs: false, protein: false, fat: false, prebolus: false, duration: false, percent: false, absolute: false, profile: false, split: false, sensor: false
      }
      , { val: 'Note'
        , name: 'Note'
        , bg: true, insulin: false, carbs: false, protein: false, fat: false, prebolus: false, duration: true, percent: false, absolute: false, profile: false, split: false, sensor: false
      }
      , { val: 'Exercise'
        , name: 'Exercise'
        , bg: false, insulin: false, carbs: false, protein: false, fat: false, prebolus: false, duration: true, percent: false, absolute: false, profile: false, split: false, sensor: false
      }
      , { val: 'Site Change'
        , name: 'Pump Site Change'
        , bg: true, insulin: true, carbs: false, protein: false, fat: false, prebolus: false, duration: false, percent: false, absolute: false, profile: false, split: false, sensor: false
      }
      , { val: 'Sensor Change'
        , name: 'CGM Sensor Insert'
        , bg: true, insulin: false, carbs: false, protein: false, fat: false, prebolus: false, duration: false, percent: false, absolute: false, profile: false, split: false, sensor: true
      }
      , { val: 'Insulin Change'
        , name: 'Insulin Cartridge Change'
        , bg: true, insulin: false, carbs: false, protein: false, fat: false, prebolus: false, duration: false, percent: false, absolute: false, profile: false, split: false, sensor: false
      }
    ];

  };

  return careportal;
}

module.exports = init;
