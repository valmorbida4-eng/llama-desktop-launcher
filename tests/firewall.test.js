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

test('compartilhamento libera somente launcher na porta adicional e agrega uma solicitação elevada',async()=>{
 const {createRules}=require('../build/app/firewall');
 const sharing={program:'C:/Apps/Llama Desktop Launcher.exe',port:8181,remoteAddress:'100.64.0.0/10',sharing:true};
 assert.equal(validateRuleOptions(sharing).port,8181);
 assert.throws(()=>validateRuleOptions({...sharing,program:'C:/Apps/other.exe'}));
 assert.throws(()=>validateRuleOptions({...sharing,port:8080}));
 let calls=0,script;
 await createRules([valid,sharing],{platform:'win32',run:async(_file,args)=>{calls++;script=Buffer.from(args.at(-1),'base64').toString('utf16le');}});
 assert.equal(calls,1);assert.match(script,/-Verb RunAs/);
});

test('Strata/PolyStrata no Windows: aceita o python.exe base e mantém os demais limites', () => {
  const python = { program: 'C:\\Python312\\python.exe', port: 8081, remoteAddress: '100.64.0.0/10' };
  assert.deepEqual(validateRuleOptions(python), python);
  assert.match(buildFirewallScript(python), /-Program 'C:\\Python312\\python\.exe'/);
  assert.throws(() => validateRuleOptions({ ...python, program: 'C:\\Python312\\pythonw.exe' }), /llama-server.exe ou o python.exe/);
  assert.throws(() => validateRuleOptions({ ...python, port: 8181 }), /8080 e 8180/);
  // O compartilhamento continua restrito ao executável do launcher.
  assert.throws(() => validateRuleOptions({ ...python, port: 8200, sharing: true }), /compartilhamento só pode liberar o launcher/);
});

test('o risco do python.exe compartilhado e a remoção das regras estão avisados no app e nos guias', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const card = read('src/index.html').match(/<section id="firewall-controls"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(card, /python\.exe instalado no sistema/);
  assert.match(card, /continua no Windows depois que o servidor para/);
  assert.match(read('src/renderer.ts'), /libera o python\.exe do sistema/);
  const rulesCard = read('src/index.html').match(/<section id="firewall-rules-card"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(rulesCard, /id="list-firewall-rules"/);
  assert.match(rulesCard, /id="remove-firewall-rules"/);
  assert.match(rulesCard, /python\.exe do sistema/);
  for (const guide of ['INTEGRATION-pt-BR', 'INTEGRATION-en', 'DIAGNOSTICS-pt-BR', 'DIAGNOSTICS-en']) {
    const text = read(`docs/${guide}.md`);
    assert.match(text, /Get-NetFirewallRule -Name 'LlamaDesktopLauncher-\*' \\?\| Remove-NetFirewallRule/, guide);
    assert.match(text, /python\.exe/, guide);
  }
});

const firewall = require('../build/app/firewall');
const nameA = 'LlamaDesktopLauncher-0123456789abcdef', nameB = 'LlamaDesktopLauncher-fedcba9876543210';
const decode = args => Buffer.from(args[args.length - 1], 'base64').toString('utf16le');
// Simula o powershell.exe: as listagens devolvem as regras atuais, e a remoção elevada as apaga.
function fakePowerShell(initial, { failRemoval = false } = {}) {
  let rules = [...initial];
  const calls = [];
  const run = async (file, args) => {
    assert.equal(file, 'powershell.exe');
    const script = decode(args);
    calls.push(script);
    if (script.includes('Start-Process')) {
      if (failRemoval) throw Error('The operation was canceled by the user.');
      rules = [];
      return { stdout: '' };
    }
    return { stdout: rules.map(name => `${name}\tLlama Desktop Launcher (8080)`).join('\r\n') };
  };
  return { run, calls };
}

test('listagem só reconhece regras com o nome gerado pelo launcher', () => {
  assert.match(firewall.buildListRulesScript(), /Get-NetFirewallRule -Name 'LlamaDesktopLauncher-\*' -ErrorAction SilentlyContinue/);
  assert.doesNotMatch(firewall.buildListRulesScript(), /Remove-|RunAs/);
  const parsed = firewall.parseRuleList(`${nameA}\tLlama Desktop Launcher (8080)\r\nLlamaDesktopLauncher-outra\tX\nCoreNet-DHCP-In\tY\n\n${nameB}`);
  assert.deepEqual(parsed, [{ name: nameA, displayName: 'Llama Desktop Launcher (8080)' }, { name: nameB, displayName: '' }]);
});

test('script de remoção cita só nomes exatos de regras do launcher', () => {
  assert.equal(firewall.buildRemoveRulesScript([nameA, nameB]).split('\n')[1], `Remove-NetFirewallRule -Name @('${nameA}','${nameB}')`);
  for (const bad of [[], ['CoreNet-DHCP-In'], ["LlamaDesktopLauncher-0123456789abcdef'; Remove-NetFirewallRule -All; '"], 'x'])
    assert.throws(() => firewall.buildRemoveRulesScript(bad), /Lista de regras inválida/);
});

test('sem regras do launcher, nada é elevado; com regras, uma única elevação apaga e confere', async () => {
  const empty = fakePowerShell([]);
  assert.deepEqual(await firewall.removeRules({ platform: 'win32', run: empty.run }), { removed: 0, remaining: 0 });
  assert.equal(empty.calls.length, 1);
  assert.ok(!empty.calls.some(script => script.includes('RunAs')));

  const some = fakePowerShell([nameA, nameB]);
  assert.deepEqual(await firewall.removeRules({ platform: 'win32', run: some.run }), { removed: 2, remaining: 0 });
  assert.equal(some.calls.length, 3);
  const elevated = some.calls[1];
  assert.match(elevated, /Start-Process -FilePath 'powershell\.exe' -Verb RunAs/);
  const inner = Buffer.from(elevated.match(/'-EncodedCommand','([^']+)'/)[1], 'base64').toString('utf16le');
  assert.match(inner, new RegExp(`Remove-NetFirewallRule -Name @\\('${nameA}','${nameB}'\\)`));
});

test('UAC negado vira mensagem clara, e fora do Windows não há remoção', async () => {
  const denied = fakePowerShell([nameA], { failRemoval: true });
  await assert.rejects(firewall.removeRules({ platform: 'win32', run: denied.run }), /autorização de administrador foi negada/);
  await assert.rejects(firewall.removeRules({ platform: 'linux', run: async () => ({ stdout: '' }) }), /só existem no Windows/);
});
