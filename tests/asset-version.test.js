'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ejs = require('ejs');
const vm = require('vm');
const webpack = require('webpack');
const BuildVersionPlugin = require('../webpack/build-version-plugin');
const assetVersion = require('../lib/server/asset-version');

describe('asset build versions', function () {
  this.timeout(10000);
  let directory;

  beforeEach(function () {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nightscout-assets-'));
  });

  afterEach(function () {
    fs.rmSync(directory, {recursive: true, force: true});
  });

  function build () {
    const entry = path.join(directory, 'entry.js');
    fs.writeFileSync(entry, 'console.log("test build");');
    return new Promise((resolve, reject) => {
      const compiler = webpack({mode: 'production', entry,
        output: {path: directory, filename: 'bundle.app.js'},
        plugins: [new BuildVersionPlugin()]});
      compiler.run((err, stats) => {
        compiler.close((closeError) => {
          if (err || closeError) { reject(err || closeError); return; }
          if (stats.hasErrors()) { reject(new Error(stats.toString())); return; }
          resolve(assetVersion(directory, false));
        });
      });
    });
  }

  it('emits a new public ID on each real Webpack build and preserves it on server restart', async function () {
    const first = await build();
    assert(/^[a-f0-9]{32}$/.test(first));
    assert.strictEqual(assetVersion(directory, false), first);
    const second = await build();
    assert.notStrictEqual(second, first);
    assert.strictEqual(assetVersion(directory, false), second);
    assert(fs.existsSync(path.join(directory, 'bundle.app.js')));
  });

  it('handles old builds and invalid manifests without exposing their contents', function () {
    assert(/^[a-f0-9]{32}$/.test(assetVersion(directory, false)));
    fs.writeFileSync(path.join(directory, 'build-version.json'), '{"version":"invalid/<script>"}');
    assert(/^[a-f0-9]{32}$/.test(assetVersion(directory, false)));
    assert.strictEqual(assetVersion(directory, true), 'developmentMode');
  });

  it('renders matching versioned script URLs in pages and the service worker', function () {
    const version = 'a'.repeat(32);
    const locals = {cachebuster: version, bundle: '/bundle/' + version,
      asset: url => '/assets/' + version + url};
    const views = path.join(__dirname, '../views');
    ['index.html', 'foodindex.html', 'adminindex.html', 'profileindex.html',
      'reportindex.html', 'clockviews/clock.html'].forEach(file => {
      const template = fs.readFileSync(path.join(views, file), 'utf8');
      ejs.compile(template);
      const scripts = template.match(/<script src="<%= locals\.[^\n]+/g).join('\n');
      const rendered = ejs.render(scripts, {locals});
      assert(rendered.includes('/bundle/' + version + '/js/bundle.'));
      assert(!rendered.includes('<%'));
    });
    const worker = ejs.render(fs.readFileSync(path.join(views, 'service-worker.js'), 'utf8'), {locals});
    new vm.Script(worker);
    assert(worker.includes('/bundle/' + version + '/js/bundle.app.js'));
    assert(worker.includes('/bundle/' + version + '/js/bundle.clock.js'));
    assert(worker.includes('/assets/' + version + '/js/client.js'));
    assert(!worker.includes("'/bundle/js/bundle.app.js'"));
  });
});
