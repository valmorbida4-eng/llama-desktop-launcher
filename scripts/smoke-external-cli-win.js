'use strict';
// Opt-in local smoke test (Windows only): npm run smoke:external:win
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { powershellScript } = require('../build/app/terminal_cli');

async function main() {
  if (process.platform !== 'win32') throw Error('Execute este smoke test somente no Windows.');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'llama-cli-smoke-'));
  const script = path.join(directory, 'run.ps1');
  const marker = path.join(directory, 'argument.txt');
  fs.writeFileSync(script, `\uFEFF${powershellScript(process.cwd(), process.execPath, ['-e', "require('node:fs').writeFileSync(process.argv[1],process.argv[2])", marker, "modelo com ' e espaços"])}`);
  await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(Error(stderr || `PowerShell saiu com ${code}: ${stdout}`)));
    child.stdin.end('\n');
  });
  assert.equal(fs.readFileSync(marker, 'utf8'), "modelo com ' e espaços");
  fs.rmSync(directory, { recursive: true, force: true });
  console.log('PowerShell executou a CLI com espaços e aspas preservados.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
