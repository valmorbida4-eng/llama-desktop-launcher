'use strict';

// No Windows, um programa chamado só pelo nome (powershell.exe, nvidia-smi, docker, tar) é procurado
// primeiro na pasta atual. Quem abre o launcher a partir de uma pasta baixada executaria o arquivo de lá.
// Esta variável tira a pasta atual da busca; precisa existir antes do primeiro processo filho.
function hardenExecutableSearch(platform: string = process.platform, env: NodeJS.ProcessEnv = process.env) {
  if (platform === 'win32') env.NoDefaultCurrentDirectoryInExePath = '1';
}

module.exports = { hardenExecutableSearch };
