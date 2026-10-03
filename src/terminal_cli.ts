'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const cli = require('./cli');

const shQuote = value => `'${String(value).replace(/'/g, `'\\''`)}'`;
const psQuote = value => `'${String(value).replace(/'/g, "''")}'`;

function posixScript(engineDir, executable, args) {
  const command = [executable, ...args].map(shQuote).join(' ');
  return `#!/bin/sh
cd ${shQuote(engineDir)} || exit 1
${command}
result=$?
printf '\\nllama-cli terminou (código %s). Pressione Enter para fechar.\\n' "$result"
read -r _answer
rm -f -- "$0"
rmdir -- "$(dirname -- "$0")" 2>/dev/null || true
exit "$result"
`;
}

function powershellScript(engineDir, executable, args) {
  const command = [executable, ...args].map(psQuote).join(' ');
  return `$ErrorActionPreference = 'Stop'
$result = 1
try {
  Set-Location -LiteralPath ${psQuote(engineDir)}
  & ${command}
  $result = $LASTEXITCODE
} catch {
  Write-Warning $_
}
Write-Host "llama-cli terminou (código $result)."
Read-Host 'Pressione Enter para fechar'
Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
exit $result
`;
}

function onPath(name, env = process.env) {
  return (env.PATH || '').split(path.delimiter).some(directory => {
    if (!directory) return false;
    try { fs.accessSync(path.join(directory, name), fs.constants.X_OK); return true; }
    catch { return false; }
  });
}

function terminalCommand(platform, scriptPath, env = process.env) {
  if (platform === 'win32') {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '"' + scriptPath + '"'];
    const bootstrap = "Start-Process -FilePath 'powershell.exe' -ArgumentList @(" + args.map(psQuote).join(', ') + ") -WindowStyle Normal -ErrorAction Stop";
    return { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(bootstrap, 'utf16le').toString('base64')], waitForExit: true };
  }
  if (platform === 'darwin') return { file: 'open', args: ['-a', 'Terminal', scriptPath] };
  const candidates = [
    ['x-terminal-emulator', ['-e', scriptPath]],
    ['gnome-terminal', ['--', scriptPath]],
    ['konsole', ['-e', scriptPath]],
    ['xfce4-terminal', ['-x', scriptPath]],
    ['xterm', ['-e', scriptPath]],
  ];
  const selected = candidates.find(([name]) => onPath(name, env));
  if (!selected) throw Error('Não encontrei um terminal gráfico. Instale um terminal como xterm ou gnome-terminal.');
  return { file: selected[0], args: selected[1] };
}

function openExternalCli({ engineDir, model, settings, platform = process.platform, spawnProcess = spawn }) {
  const executable = cli.executablePath(engineDir, platform);
  if (!fs.existsSync(executable)) throw Error(`Não encontrei ${cli.executableName(platform)} na pasta do llama.cpp.`);
  const args = cli.argsForConversation(model, settings);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'llama-desktop-cli-'));
  const scriptPath = path.join(directory, platform === 'win32' ? 'run.ps1' : platform === 'darwin' ? 'run.command' : 'run.sh');
  fs.writeFileSync(scriptPath, platform === 'win32' ? `\uFEFF${powershellScript(engineDir, executable, args)}` : posixScript(engineDir, executable, args), { mode: 0o700 });
  if (platform !== 'win32') fs.chmodSync(scriptPath, 0o700);
  let command;
  try { command = terminalCommand(platform, scriptPath); }
  catch (error) { fs.rmSync(directory, { recursive: true, force: true }); throw error; }
  return new Promise<void>((resolve, reject) => {
    let child;
    try { child = spawnProcess(command.file, command.args, { detached: !command.waitForExit, stdio: command.waitForExit ? ['ignore', 'ignore', 'pipe'] : 'ignore', windowsHide: !!command.waitForExit, shell: false }); }
    catch (error) { fs.rmSync(directory, { recursive: true, force: true }); reject(error); return; }
    child.once('error', error => { fs.rmSync(directory, { recursive: true, force: true }); reject(error); });
    if (command.waitForExit) {
      let stderr = '';
      child.stderr?.on('data', data => { stderr += data; });
      child.once('close', code => {
        if (code === 0) resolve();
        else { fs.rmSync(directory, { recursive: true, force: true }); reject(Error(stderr.trim() || 'Não foi possível abrir o terminal (código ' + code + ').')); }
      });
    } else child.once('spawn', () => { child.unref(); resolve(); });
  });
}

module.exports = { shQuote, psQuote, posixScript, powershellScript, terminalCommand, openExternalCli };
