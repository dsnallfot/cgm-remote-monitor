'use strict';

var assert = require('assert');
var http = require('http');

function setup (makerEnabled) {
  var levels = require('../lib/levels');
  levels.language.set('sv');
  levels.language.offerTranslations(require('../translations/sv_SE.json'));
  var env = {settings: {isAlarmEventEnabled: function () { return true; }}};
  var ctx = {levels: levels, maker: null};
  var maker = require('../lib/plugins/maker')({extendedSettings: {maker: {key: 'test'}}});
  var makerRequests = [];
  maker.makeKeyRequest = function (key, event, eventName, callback) {
    makerRequests.push({event: eventName, values: new URLSearchParams(maker.valuesToQuery(event))});
    callback(null, {});
  };
  if (makerEnabled) { ctx.maker = maker; }
  ctx.customwebhook = require('../lib/server/customwebhook')({settings: {
    customWebhookUrl1: 'http://127.0.0.1/api/webhook/test'
    , customWebhookEvent1: 'ns-information-treatmentnotify'
  }});
  var payloads = [];
  ctx.customwebhook.sendRequest = function (webhook, payload, callback) {
    payloads.push(JSON.parse(JSON.stringify(payload)));
    callback(null);
  };
  return {ctx: ctx, makerRequests: makerRequests, payloads: payloads,
    push: require('../lib/server/pushnotify')(env, ctx)};
}

describe('customwebhook - local Maker compatibility', function () {
  it('preserves actual Swedish treatment strings through both delivery paths', function () {
    var setupResult = setup(true);
    var ctx = setupResult.ctx;
    var plugin = require('../lib/plugins/treatmentnotify')(ctx);
    var now = Date.now();
    plugin.checkNotifications({
      data: {treatments: [{eventType: 'Meal Bolus', carbs: 15, insulin: 1.25,
        notes: 'Åäö & + = %\nAndra raden', enteredBy: 'Trio', mills: now, timestamp: now}], mbgs: []}
      , extendedSettings: {}
      , lastEntry: function (entries) { return entries[entries.length - 1]; }
      , language: ctx.levels.language
      , levels: ctx.levels
      , roundInsulinForDisplayFormat: function (value) { return value; }
      , notifications: {requestSnooze: function () {}, requestNotify: setupResult.push.emitNotification}
    });
    assert.strictEqual(setupResult.payloads.length, 1);
    assert.strictEqual(setupResult.makerRequests.length, 1);
    var payload = setupResult.payloads[0];
    var makerRequest = setupResult.makerRequests[0];
    assert.strictEqual(payload.event, 'ns-information-treatmentnotify');
    assert.strictEqual(payload.event, makerRequest.event);
    assert.strictEqual(payload.value1, makerRequest.values.get('value1'));
    assert.strictEqual(payload.value2, makerRequest.values.get('value2'));
    assert.strictEqual(payload.value2, '\n' + payload.message);
    assert(payload.value2.includes('Åäö & + = %\nAndra raden'));
    assert.strictEqual(payload.value3, undefined);
  });

  it('works without Maker and retains its two-minute duplicate suppression', function () {
    var s = setup(false);
    var notify = {title: 'Sensorbyte', message: 'Anteckning', level: s.ctx.levels.INFO,
      plugin: {name: 'treatmentnotify'}, notifyhash: 'same-treatment'};
    var originalNow = Date.now;
    var now = originalNow();
    try {
      Date.now = function () { return now; };
      s.push.emitNotification(notify);
      now += 45000;
      s.push.emitNotification(notify);
      assert.strictEqual(s.payloads.length, 1);
      now += 80000;
      s.push.emitNotification(notify);
      assert.strictEqual(s.payloads.length, 2);
    } finally {
      Date.now = originalNow;
    }
    s.push.emitNotification({title: 'Low', message: 'BG', level: s.ctx.levels.URGENT,
      plugin: {name: 'simplealarms'}});
    s.push.emitNotification({clear: true});
    assert.strictEqual(s.payloads.length, 2);
  });
});

describe('customwebhook - real HTTP transport', function () {
  [204, 500, 'abort'].forEach(function (status) {
    it('handles ' + status + ' and preserves the JSON body and query string', function (done) {
      var server = http.createServer(function (req, res) {
        var body = '';
        req.setEncoding('utf8');
        req.on('data', function (chunk) { body += chunk; });
        req.on('end', function () {
          assert.strictEqual(req.method, 'POST');
          assert.strictEqual(req.url, '/api/webhook/test?token=test');
          assert.strictEqual(req.headers['content-type'], 'application/json');
          assert.strictEqual(JSON.parse(body).value2, '\n\nKolhydrater: 15g\nÅäö & +');
          if (status === 'abort') { req.socket.destroy(); return; }
          res.writeHead(status);
          res.end();
        });
      });
      server.listen(0, '127.0.0.1', function () {
        var customwebhook = require('../lib/server/customwebhook')({settings: {
          customWebhookUrl1: 'http://127.0.0.1:' + server.address().port + '/api/webhook/test?token=test'
          , customWebhookEvent1: 'ns-information-treatmentnotify'
        }});
        customwebhook.sendEvent({name: 'treatmentnotify', level: 'information',
          title: 'Måltid', message: '\nKolhydrater: 15g\nÅäö & +'}, function (err, result) {
          server.close(function () {
            assert.strictEqual(Boolean(err), status !== 204);
            assert.strictEqual(result.sent, status === 204 ? 1 : 0);
            done();
          });
        });
      });
    });
  });
});
