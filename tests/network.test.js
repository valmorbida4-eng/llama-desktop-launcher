'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { upstreamRequestDetails, createProxy } = require('../build/app/network');

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function sendRawRequest(port, requestText) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let response = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Proxy did not close the malformed request.'));
    }, 3000);
    socket.on('connect', () => socket.write(requestText));
    socket.on('data', chunk => { response += chunk.toString('latin1'); });
    socket.on('end', () => { clearTimeout(timer); resolve(response); });
    socket.on('error', error => { clearTimeout(timer); reject(error); });
  });
}

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

test('proxy returns HTTP 400 for an authenticated malformed request target', async t => {
  const port = await unusedPort();
  const proxy = await createProxy('192.168.1.10', 8080, 'remote-key', port, 'local-secret');
  t.after(() => new Promise(resolve => proxy.close(resolve)));

  const response = await sendRawRequest(port,
    `GET http://[ HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nCookie: llama_token=local-secret\r\n\r\n`);
  assert.match(response, /^HTTP\/1\.1 400 Bad Request\r\n/);
  assert.doesNotMatch(response, /local-secret|remote-key/);
});

test('proxy returns WebSocket 400 for an authenticated malformed request target', async t => {
  const port = await unusedPort();
  const proxy = await createProxy('192.168.1.10', 8080, 'remote-key', port, 'local-secret');
  t.after(() => new Promise(resolve => proxy.close(resolve)));

  const response = await sendRawRequest(port,
    `GET http://[ HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nCookie: llama_token=local-secret\r\n` +
    'Connection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
  assert.match(response, /^HTTP\/1\.1 400 Bad Request\r\n/);
  assert.doesNotMatch(response, /local-secret|remote-key/);
});
