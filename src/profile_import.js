'use strict';

const path = require('node:path');
const { TextDecoder } = require('node:util');
const { validateSettings } = require('./core');

const SETTINGS_FIELDS = [
  'gpuLayers',
  'context',
  'cacheK',
  'cacheV',
  'cpuMoe',
  'flash',
  'threads',
  'batch',
  'ubatch',
  'device',
];

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function decodeProfilePath(encoded) {
  if (!encoded || !BASE64_PATTERN.test(encoded)) {
    throw Error('caminho em Base64 inválido');
  }

  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) {
    throw Error('caminho em Base64 inválido');
  }

  let decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw Error('caminho não é UTF-8 válido');
  }

  if (!decoded || decoded.includes('\0')) {
    throw Error('caminho vazio ou inválido');
  }
  if (!path.win32.isAbsolute(decoded) && !path.posix.isAbsolute(decoded)) {
    throw Error('caminho não é absoluto');
  }
  return decoded;
}

function parseLegacyProfiles(contents) {
  if (typeof contents !== 'string') {
    throw new TypeError('O conteúdo do arquivo de perfis deve ser texto.');
  }

  const profiles = [];
  const ignored = [];
  const seenPaths = new Set();
  const lines = contents.replace(/^\uFEFF/, '').split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];
    if (!line.trim()) continue;

    try {
      const columns = line.split('\t');
      if (columns.length !== 11) {
        throw Error(`esperadas 11 colunas, encontradas ${columns.length}`);
      }

      const modelPath = decodeProfilePath(columns[0]);
      const pathKey = process.platform === 'win32' || path.win32.isAbsolute(modelPath)
        ? modelPath.toLowerCase()
        : modelPath;
      if (seenPaths.has(pathKey)) {
        throw Error('perfil duplicado para o mesmo caminho');
      }

      const settings = Object.fromEntries(
        SETTINGS_FIELDS.map((field, fieldIndex) => [field, columns[fieldIndex + 1].trim()]),
      );
      validateSettings(settings);

      seenPaths.add(pathKey);
      profiles.push({ path: modelPath, settings, line: lineNumber });
    } catch (error) {
      ignored.push({ line: lineNumber, reason: error.message });
    }
  }

  return { profiles, ignored };
}

module.exports = { parseLegacyProfiles };
