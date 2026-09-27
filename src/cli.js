'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const core = require('./core');

function executableName(platform = process.platform) {
  return `llama-cli${platform === 'win32' ? '.exe' : ''}`;
}

function executablePath(engineDir, platform = process.platform) {
  if (typeof engineDir !== 'string' || !engineDir.trim()) throw Error('Selecione a pasta do llama.cpp primeiro.');
  return path.join(engineDir, executableName(platform));
}

function argsForConversation(model, settings) {
  return core.argsForModel(model, settings, 'cli');
}

function createSession({ engineDir, model, settings, onOutput = () => {}, onExit = () => {}, onError = () => {}, spawnProcess = spawn }) {
  const executable = executablePath(engineDir);
  if (!fs.existsSync(executable)) throw Error(`Não encontrei ${executableName()} na pasta do llama.cpp.`);
  const args = argsForConversation(model, settings);
  const child = spawnProcess(executable, args, {
    cwd: engineDir,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };
  let closed = false;
  let spawned = false;

  child.once('spawn', () => { spawned = true; });
  for (const stream of ['stdout', 'stderr']) {
    child[stream].on('data', chunk => {
      const text = decoders[stream].write(chunk);
      if (text) onOutput({ stream, text });
    });
    child[stream].once('end', () => {
      const text = decoders[stream].end();
      if (text) onOutput({ stream, text });
    });
  }
  child.once('error', error => {
    closed = true;
    onError(error);
  });
  child.once('close', (code, signal) => {
    closed = true;
    onExit({ code, signal });
  });

  function send(message) {
    if (closed || !child.stdin || child.stdin.destroyed || child.stdin.writableEnded) return Promise.reject(Error('A conversa foi encerrada.'));
    if (typeof message !== 'string' || !message.trim()) return Promise.reject(Error('Digite uma mensagem antes de enviar.'));
    if (message.length > 100000 || message.includes('\0')) return Promise.reject(Error('Mensagem inválida ou longa demais.'));
    return new Promise((resolve, reject) => {
      const payload = `${message}\n`;
      if (child.stdin.write(payload, 'utf8')) resolve();
      else {
        child.stdin.once('drain', resolve);
        child.stdin.once('error', reject);
      }
    });
  }

  function stop() {
    if (closed) return false;
    closed = true;
    child.kill();
    return true;
  }

  return { child, executable, args, send, stop, get started() { return spawned; } };
}

module.exports = { executableName, executablePath, argsForConversation, createSession };
