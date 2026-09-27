'use strict';

const { execFile } = require('node:child_process');

const DEFAULT_TIMEOUT_MS = 1500;
const NULL_GPU = Object.freeze({ name: null, memoryBytes: null, source: null });

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      encoding: 'utf8',
      timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    }, (error, stdout) => {
      if (error) return reject(error);
      resolve(stdout || '');
    });
  });
}

function result(name, memoryBytes, source) {
  const cleanName = typeof name === 'string' && name.trim() ? name.trim() : null;
  const cleanMemory = Number.isSafeInteger(memoryBytes) && memoryBytes > 0 ? memoryBytes : null;
  return cleanName || cleanMemory ? { name: cleanName, memoryBytes: cleanMemory, source } : null;
}

function parseNvidiaSmi(output) {
  const line = String(output).split(/\r?\n/).find(row => row.trim());
  if (!line) return null;
  // NVIDIA's CSV quotes names containing commas. The numeric total is always last.
  const match = /^\s*(?:"((?:[^"]|"")*)"|(.+?))\s*,\s*(\d+)\s*(?:MiB|MB)?\s*$/i.exec(line);
  if (!match) return null;
  const name = (match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2]).trim();
  const memoryBytes = Number(match[3]) * 1024 * 1024;
  return result(name, memoryBytes, 'nvidia-smi');
}

function parseVulkan(output) {
  const text = String(output);
  const nameMatch = /^\s*deviceName\s*[:=]\s*(.+?)\s*$/im.exec(text);
  // Only count explicitly reported device-local heaps. BAR sizes and shared system
  // memory are not VRAM, so they are intentionally ignored.
  let localBytes = 0;
  const blocks = text.matchAll(/memoryHeaps\[\d+\]:([\s\S]*?)(?=memoryHeaps\[\d+\]:|memoryTypes:|$)/gi);
  for (const [, block] of blocks) {
    if (!/device[_\s]+local/i.test(block)) continue;
    const size = /\bsize\s*=\s*([\d,]+)\s*(B|KiB|MiB|GiB)?/i.exec(block);
    if (!size) continue;
    const value = Number(size[1].replace(/,/g, ''));
    const unit = (size[2] || 'B').toLowerCase();
    const multiplier = unit === 'kib' ? 1024 : unit === 'mib' ? 1024 ** 2 : unit === 'gib' ? 1024 ** 3 : 1;
    if (Number.isSafeInteger(value * multiplier)) localBytes += value * multiplier;
  }
  return result(nameMatch?.[1], localBytes || null, 'vulkaninfo');
}

function parseLspci(output) {
  const line = String(output).split(/\r?\n/).find(row => /(?:VGA compatible controller|3D controller|Display controller)(?:\s+\[[^\]]+\])?:/i.test(row));
  if (!line) return null;
  const match = /(?:VGA compatible controller|3D controller|Display controller)(?:\s+\[[^\]]+\])?:\s*(.+)$/i.exec(line);
  if (!match) return null;
  const name = match[1].replace(/\s*\[[0-9a-f]{4}:[0-9a-f]{4}\]\s*$/i, '').trim();
  return result(name, null, 'lspci');
}

function parsePowerShell(output) {
  let devices;
  try { devices = JSON.parse(String(output).trim()); } catch { return null; }
  if (!Array.isArray(devices)) devices = devices ? [devices] : [];
  for (const device of devices) {
    if (!device || typeof device !== 'object') continue;
    const rawMemory = Number(device.AdapterRAM);
    // Win32_VideoController.AdapterRAM is a 32-bit field; the max value signals
    // overflow on many GPUs, so do not present it as a real capacity.
    const memoryBytes = Number.isSafeInteger(rawMemory) && rawMemory > 0 && rawMemory < 0xffffffff ? rawMemory : null;
    const found = result(device.Name, memoryBytes, 'powershell-cim');
    if (found) return found;
  }
  return null;
}

function parseSystemProfiler(output) {
  let data;
  try { data = JSON.parse(String(output)); } catch { return null; }
  const devices = data?.SPDisplaysDataType;
  if (!Array.isArray(devices)) return null;
  for (const device of devices) {
    if (!device || typeof device !== 'object') continue;
    const name = device.sppci_model || device._name || device.spdisplays_device_name;
    const memoryText = device.spdisplays_vram;
    const memoryMatch = typeof memoryText === 'string' && /([\d.]+)\s*(bytes?|KB|MB|GB|TB)\b/i.exec(memoryText);
    let memoryBytes = null;
    if (memoryMatch) {
      const unit = memoryMatch[2].toLowerCase();
      const multiplier = unit.startsWith('t') ? 1024 ** 4 : unit.startsWith('g') ? 1024 ** 3 : unit.startsWith('m') ? 1024 ** 2 : unit.startsWith('k') ? 1024 : 1;
      const value = Math.round(Number(memoryMatch[1]) * multiplier);
      if (Number.isSafeInteger(value) && value > 0) memoryBytes = value;
    }
    const found = result(name, memoryBytes, 'system_profiler');
    if (found) return found;
  }
  return null;
}

function psScript() {
  return "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress";
}

/**
 * Detects a GPU without elevated permissions. Each probe has a short timeout and
 * failures are ignored. The optional options argument is intended for tests and
 * callers that need to inject a command runner/platform.
 *
 * @param {{platform?: string, run?: (command: string, args: string[], options: {timeoutMs: number}) => Promise<string>, timeoutMs?: number}} options
 * @returns {Promise<{name: string|null, memoryBytes: number|null, source: string|null}>}
 */
async function detectGpu(options = {}) {
  const platform = options.platform || process.platform;
  const run = options.run || runCommand;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(100, Math.min(options.timeoutMs, 5000)) : DEFAULT_TIMEOUT_MS;
  const probes = [
    ['nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], parseNvidiaSmi],
  ];
  if (platform === 'linux') {
    probes.push(['vulkaninfo', ['--summary'], parseVulkan], ['lspci', ['-nn'], parseLspci]);
  } else if (platform === 'win32') {
    probes.push(['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript()], parsePowerShell]);
  } else if (platform === 'darwin') {
    probes.push(['system_profiler', ['SPDisplaysDataType', '-json'], parseSystemProfiler]);
  }
  let best = null;
  for (const [command, args, parse] of probes) {
    try {
      const output = await run(command, args, { timeoutMs });
      const found = parse(typeof output === 'string' ? output : output?.stdout || '');
      if (!found) continue;
      if (found.name && found.memoryBytes !== null) return found;
      // Keep the first trustworthy value for each field, while allowing a later
      // platform utility to fill in a value that the preferred tool omitted.
      best = {
        name: best?.name || found.name,
        memoryBytes: best?.memoryBytes ?? found.memoryBytes,
        source: best?.source || found.source,
      };
    } catch { /* GPU utilities may be absent or blocked; try the next probe. */ }
  }
  return best || { ...NULL_GPU };
}

module.exports = { detectGpu };
