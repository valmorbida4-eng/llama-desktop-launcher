'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isSemVer, checkVersions } = require('../scripts/check-version');

test('project version uses strict SemVer and matches the lockfile', () => {
  assert.equal(checkVersions(), '0.1.0');
});

test('SemVer accepts prerelease and build metadata', () => {
  assert.equal(isSemVer('1.2.3-alpha.1+build.7'), true);
});

test('SemVer rejects malformed and leading-zero versions', () => {
  for (const version of ['1.2', '01.2.3', '1.02.3', '1.2.3-01', 'v1.2.3']) {
    assert.equal(isSemVer(version), false, version);
  }
});

test('version check catches a package-lock mismatch', () => {
  assert.throws(
    () => checkVersions({ version: '0.1.0' }, { version: '0.1.1', packages: { '': { version: '0.1.0' } } }),
    /must match/
  );
});
