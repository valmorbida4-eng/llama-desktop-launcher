'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

function isSemVer(version) {
  if (typeof version !== 'string') return false;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(version);
  if (!match) return false;
  const prerelease = match[4];
  if (!prerelease) return true;
  return prerelease.split('.').every(identifier =>
    !/^\d+$/.test(identifier) || identifier === '0' || !identifier.startsWith('0'));
}

function checkVersions(packageJson = manifest, packageLock = lock) {
  if (!isSemVer(packageJson.version)) {
    throw new Error(`package.json version must be strict SemVer: ${packageJson.version}`);
  }
  if (packageLock.version !== packageJson.version || packageLock.packages?.['']?.version !== packageJson.version) {
    throw new Error('package.json and package-lock.json versions must match.');
  }
  return packageJson.version;
}

if (require.main === module) {
  try {
    console.log(`SemVer valid: ${checkVersions()}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { isSemVer, checkVersions };
