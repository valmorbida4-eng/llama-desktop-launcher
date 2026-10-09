'use strict';

// Confere se a release do llama.cpp fixada em ENGINE_TAG publica todos os pacotes
// que o launcher oferece. Requer `npm run build` antes. Usa GITHUB_TOKEN se existir.
const engine = require('../build/app/engine');

const PLATFORMS = ['win32', 'linux', 'darwin'];
const ARCHES = ['x64', 'arm64'];

async function fetchRelease(tag) {
  const headers = { 'User-Agent': 'Llama-Desktop-Launcher', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/${tag}`, { headers });
  if (!response.ok) throw new Error(`Release ${tag}: HTTP ${response.status}`);
  return response.json();
}

function missingAssets(release) {
  const missing = [];
  for (const platform of PLATFORMS) for (const arch of ARCHES) {
    for (const option of engine.backendOptions(platform, arch)) {
      try { engine.assetsFor(release, option.id, platform, arch); }
      catch { missing.push(`${platform}/${arch} ${option.id}`); }
    }
  }
  return missing;
}

async function main() {
  const release = await fetchRelease(engine.ENGINE_TAG);
  const missing = missingAssets(release);
  if (missing.length) {
    console.error(`${engine.ENGINE_TAG}: pacotes ausentes para:\n- ${missing.join('\n- ')}`);
    process.exit(1);
  }
  console.log(`${engine.ENGINE_TAG}: todos os pacotes dos backends oferecidos estão publicados.`);
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exit(1); });

module.exports = { missingAssets };
