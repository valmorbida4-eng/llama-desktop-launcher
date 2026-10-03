'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT_MIN = 8080;
const PORT_MAX = 8180;
const ALLOWED_RANGES = [
  { address: '10.0.0.0', prefix: 8 },
  { address: '172.16.0.0', prefix: 12 },
  { address: '192.168.0.0', prefix: 16 },
  { address: '100.64.0.0', prefix: 10 },
];

function ipv4ToInt(address) {
  if (typeof address !== 'string' || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) return null;
  const octets = address.split('.').map(Number);
  if (octets.some(value => value > 255)) return null;
  return (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3]) >>> 0;
}

function isWithinRange(address, prefix, range) {
  const bits = ipv4ToInt(address);
  const base = ipv4ToInt(range.address);
  if (bits === null || base === null || prefix < range.prefix) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const rangeMask = (0xffffffff << (32 - range.prefix)) >>> 0;
  return (bits & rangeMask) === (base & rangeMask);
}

function validateRemoteAddress(input) {
  if (typeof input !== 'string' || input.trim() !== input) throw Error('Informe um endereço IPv4 ou uma faixa CIDR privada.');
  const parts = input.split('/');
  if (parts.length > 2) throw Error('Faixa de endereço inválida.');
  const address = parts[0];
  const ip = ipv4ToInt(address);
  if (ip === null) throw Error('Informe um endereço IPv4 válido.');
  const prefix = parts.length === 1 ? 32 : Number(parts[1]);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw Error('Prefixo CIDR inválido.');
  if (!ALLOWED_RANGES.some(range => isWithinRange(address, prefix, range))) {
    throw Error('O endereço remoto deve ficar dentro de uma rede LAN privada ou Tailscale.');
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0;
  const canonical = [network >>> 24, (network >>> 16) & 255, (network >>> 8) & 255, network & 255].join('.');
  return prefix === 32 ? address : `${canonical}/${prefix}`;
}

function validateRuleOptions(options) {
  if (!options || typeof options !== 'object') throw Error('Configuração da regra de firewall inválida.');
  if (typeof options.program !== 'string' || !path.win32.isAbsolute(options.program)) throw Error('O caminho do llama-server precisa ser absoluto.');
  const program = path.win32.normalize(options.program);
  const sharing=options.sharing===true;
  if (sharing?!['llama desktop launcher.exe','electron.exe'].includes(path.win32.basename(program).toLowerCase()):path.win32.basename(program).toLowerCase() !== 'llama-server.exe') throw Error('A regra só pode liberar llama-server.exe.');
  const port = Number(options.port);
  if (!Number.isInteger(port) || port < (sharing?8181:PORT_MIN) || port > (sharing?8280:PORT_MAX)) throw Error(`A porta deve estar entre ${PORT_MIN} e ${PORT_MAX}.`);
  return { program, port, remoteAddress: validateRemoteAddress(options.remoteAddress),...(sharing?{sharing:true}:{}) };
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function ruleName({ program, port, remoteAddress }) {
  const id = crypto.createHash('sha256').update(`${program.toLowerCase()}|${port}|${remoteAddress}`).digest('hex').slice(0, 16);
  return `LlamaDesktopLauncher-${id}`;
}

function buildFirewallScript(input) {
  const config = validateRuleOptions(input);
  const name = ruleName(config);
  return [
    "$ErrorActionPreference = 'Stop'",
    'New-NetFirewallRule ' + [
      `-Name ${psQuote(name)}`,
      `-DisplayName ${psQuote(`Llama Desktop Launcher (${config.port})`)}`,
      '-Direction Inbound',
      '-Action Allow',
      '-Enabled True',
      '-Protocol TCP',
      `-LocalPort ${config.port}`,
      `-Program ${psQuote(config.program)}`,
      `-RemoteAddress ${psQuote(config.remoteAddress)}`,
      "-Profile Any",
      "-Description 'Created on user request by Llama Desktop Launcher; limited to the selected executable, one port, and one private network range.'",
    ].join(' '),
    'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
  ].join('\n');
}

function encodePowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function elevatedPowerShellScript(innerScript) {
  const encoded = encodePowerShell(innerScript);
  return [
    "$ErrorActionPreference = 'Stop'",
    `$arguments = @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}')`,
    "$process = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -ArgumentList $arguments",
    'exit $process.ExitCode',
  ].join('\n');
}

async function createRule(options, { platform = process.platform, run = promisify(execFile) } = {}) {
  if (platform !== 'win32') throw Error('A regra do Windows Firewall só está disponível no Windows.');
  const script = elevatedPowerShellScript(buildFirewallScript(options));
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShell(script)], { windowsHide: true });
  return { ...validateRuleOptions(options), name: ruleName(validateRuleOptions(options)) };
}

async function createRules(options, { platform=process.platform, run=promisify(execFile) }={}){
  if(platform!=='win32')throw Error('A regra do Windows Firewall só está disponível no Windows.');
  const configs=options.map(validateRuleOptions);
  const script=elevatedPowerShellScript(options.map(buildFirewallScript).join('\n'));
  await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',encodePowerShell(script)],{windowsHide:true});
  return configs;
}
module.exports = { PORT_MIN, PORT_MAX, validateRemoteAddress, validateRuleOptions, buildFirewallScript, createRule, createRules };
