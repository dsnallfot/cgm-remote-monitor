'use strict';

const crypto = require('crypto');

//A public identifier, independent of the server's signing keys.
class BuildVersionPlugin {
  apply (compiler) {
    compiler.hooks.thisCompilation.tap('BuildVersionPlugin', (compilation) => {
      const version = crypto.randomBytes(16).toString('hex');
      compilation.hooks.processAssets.tap({
        name: 'BuildVersionPlugin',
        stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL
      }, () => {
        compilation.emitAsset('build-version.json',
          new compiler.webpack.sources.RawSource(JSON.stringify({version})));
      });
    });
  }
}

module.exports = BuildVersionPlugin;
