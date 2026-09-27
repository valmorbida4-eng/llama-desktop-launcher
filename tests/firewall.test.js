'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PORT_MIN, PORT_MAX, validateRemoteAddress, validateRuleOptions, buildFirewallScript, createRule } = require('../build/app/firewall');

const valid = { program: 'C:\\Engines\\llama-server.exe', port: 8123, remoteAddress: '192.168.1.0/24' };

test('valida faixa remota LAN e Tailscale e canonicaliza a rede', () => {
  assert.equal(validateRemoteAddress('192.168.1.17/24'), '192.168.1.0/24');
  assert.equal(validateRemoteAddress('100.100.1.2'), '100.100.1.2');
  assert.equal(validateRemoteAddress('10.20.0.0/16'), '10.20.0.0/16');
  assert.throws(() => validateRemoteAddress('8.8.8.8'), /LAN privada ou Tailscale/);
  assert.throws(() => validateRemoteAddress('192.168.0.0/15'), /LAN privada ou Tailscale/);
  assert.throws(() => validateRemoteAddress('100.64.0.0/9'), /LAN privada ou Tailscale/);
  assert.throws(() => validateRemoteAddress('192.168.1.0/33'), /Prefixo/);
  assert.throws(() => validateRemoteAddress('192.168.1.2; Get-Process'), /IPv4/);
});

test('valida programa exato e porta do launcher', () => {
  assert.deepEqual(validateRuleOptions(valid), { ...valid, program: 'C:\\Engines\\llama-server.exe' });
  assert.equal(PORT_MIN, 8080);
  assert.equal(PORT_MAX, 8180);
  assert.throws(() => validateRuleOptions({ ...valid, program: 'C:\\Engines\\other.exe' }), /só pode liberar llama-server.exe/);
  assert.throws(() => validateRuleOptions({ ...valid, program: 'llama-server.exe' }), /absoluto/);
  assert.throws(() => validateRuleOptions({ ...valid, port: 80 }), /8080 e 8180/);
  assert.throws(() => validateRuleOptions({ ...valid, port: '8123; *' }), /porta/);
});

test('gera regra inbound limitada ao binário, TCP, porta e endereço informados', () => {
  const script = buildFirewallScript({ ...valid, program: "C:\\Engine's\\llama-server.exe" });
  assert.match(script, /-Direction Inbound/);
  assert.match(script, /-Action Allow/);
  assert.match(script, /-Protocol TCP/);
  assert.match(script, /-LocalPort 8123/);
  assert.match(script, /-Program 'C:\\Engine''s\\llama-server\.exe'/);
  assert.match(script, /-RemoteAddress '192\.168\.1\.0\/24'/);
  assert.match(script, /-Profile Any/);
});

test('createRule só despacha PowerShell no Windows e permite execução simulada', async () => {
  let call;
  const result = await createRule(valid, {
    platform: 'win32',
    run: async (...args) => { call = args; return { stdout: '', stderr: '' }; },
  });
  assert.equal(result.port, valid.port);
  assert.equal(result.remoteAddress, valid.remoteAddress);
  assert.equal(call[0], 'powershell.exe');
  assert.ok(call[1].includes('-EncodedCommand'));
  await assert.rejects(createRule(valid, { platform: 'linux', run: async () => assert.fail('runner não deve executar') }), /só está disponível no Windows/);
});
