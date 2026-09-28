'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { upstreamRequestDetails } = require('../build/app/network');

test('proxy keeps the local session token out of upstream HTTP and WebSocket requests', () => {
  const request = {
    url: '/v1/models?token=local-secret&filter=gguf',
    headers: {
      host: '127.0.0.1:32100',
      cookie: 'theme=dark; llama_token=local-secret; session=other',
      referer: 'http://127.0.0.1:32100/?token=local-secret',
      authorization: 'Bearer local-secret',
      connection: 'Upgrade',
    },
  };
  const details = upstreamRequestDetails(request, 32100, '192.168.1.10:8080', 'remote-key');
  assert.equal(details.path, '/v1/models?filter=gguf');
  assert.equal(details.headers.host, '192.168.1.10:8080');
  assert.equal(details.headers.authorization, 'Bearer remote-key');
  assert.equal(details.headers.cookie, 'theme=dark; session=other');
  assert.equal(details.headers.referer, undefined);
  assert.equal(details.headers.connection, undefined);
  assert.match(JSON.stringify(details), /remote-key/);
  assert.doesNotMatch(JSON.stringify(details), /local-secret/);
});

test('proxy omits an empty local cookie header', () => {
  const details = upstreamRequestDetails(
    { url: '/?token=local-secret', headers: { cookie: 'llama_token=local-secret' } },
    32100,
    '192.168.1.10:8080',
    'remote-key',
  );
  assert.equal(details.path, '/');
  assert.equal(details.headers.cookie, undefined);
});
