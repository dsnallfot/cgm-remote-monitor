'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = function assetVersion (directory, development) {
  if (development) { return 'developmentMode'; }
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'build-version.json'), 'utf8'));
    if (/^[a-f0-9]{32}$/.test(manifest.version)) { return manifest.version; }
  } catch (err) {
    //Older installations may not have been rebuilt yet.
  }
  console.warn('No valid asset build version found; rebuild with npm run bundle. Using a startup version.');
  return crypto.randomBytes(16).toString('hex');
};
