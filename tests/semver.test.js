'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isSemVer, checkVersions, checkReleaseRef } = require('../scripts/check-version');

test('project version uses strict SemVer and matches the lockfile', () => {
  assert.equal(checkVersions(), require('../package.json').version);
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
  assert.throws(
    () => checkVersions({ version: '0.1.0' }, { version: '0.1.0', packages: { '': { version: '0.1.1' } } }),
    /must match/
  );
});

test('release tag must match the package and lockfile version', () => {
  const manifest = { version: '1.2.3' };
  const lock = { version: '1.2.3', packages: { '': { version: '1.2.3' } } };
  assert.equal(checkReleaseRef('refs/heads/main', manifest, lock), '1.2.3');
  assert.equal(checkReleaseRef('refs/tags/v1.2.3', manifest, lock), '1.2.3');
  assert.throws(() => checkReleaseRef('refs/tags/v1.2.4', manifest, lock), /must match/);
  assert.throws(() => checkReleaseRef('refs/tags/v01.2.3', manifest, lock), /must match/);
});
