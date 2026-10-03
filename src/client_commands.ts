'use strict';
const {apiModelId}=require('./core');
const bashQuote=value=>"'"+String(value).replace(/'/g,"'\\''")+"'";
const psQuote=value=>"'"+String(value).replace(/'/g,"''")+"'";
function openCodeCommand(connection, platform, accessKey: string|null=null){
  if(accessKey!==null&&!/^[A-Za-z0-9_-]{32,128}$/.test(accessKey))throw Error('Chave de compartilhamento inválida.');
  if(!['bash','powershell'].includes(platform))throw Error('Escolha Bash ou PowerShell.');
  const url=new URL(connection.endpoint);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/v1'||url.search||url.hash)throw Error('Endpoint API inválido.');
  const context=Math.floor(Number(connection.context)/Number(connection.parallel||1));
  if(!Number.isSafeInteger(context)||context<2)throw Error('Contexto inválido.');
  const configuration=JSON.stringify({model:'llama-local/'+apiModelId,provider:{'llama-local':{npm:'@ai-sdk/openai-compatible',name:'Llama no Windows',options:{baseURL:connection.endpoint,apiKey:'{env:LLAMA_API_KEY}'},models:{[apiModelId]:{name:'Modelo local',limit:{context,output:Math.min(1024,Math.floor(context/2))}}}}}});
  const remote=connection.scope!=='Local';
  if(platform==='bash')return `# Execute na pasta do projeto. Requer OpenCode instalado.
(
  export OPENCODE_CONFIG_CONTENT=${bashQuote(configuration)}
${accessKey?"  export LLAMA_API_KEY="+bashQuote(accessKey):remote?"  read -rsp 'Chave da API: ' LLAMA_API_KEY || exit 1\n  printf '\\n'\n  export LLAMA_API_KEY":"  export LLAMA_API_KEY='local'"}
  opencode --model 'llama-local/${apiModelId}'
)
`;
  return `# Execute na pasta do projeto. Requer OpenCode instalado.
& {
  $previousConfig = $env:OPENCODE_CONFIG_CONTENT
  $previousKey = $env:LLAMA_API_KEY
  try {
    $env:OPENCODE_CONFIG_CONTENT = ${psQuote(configuration)}
${accessKey?"    $env:LLAMA_API_KEY = "+psQuote(accessKey):remote?"    $secureKey = Read-Host 'Chave da API' -AsSecureString\n    $env:LLAMA_API_KEY = [System.Net.NetworkCredential]::new('', $secureKey).Password":"    $env:LLAMA_API_KEY = 'local'"}
    opencode --model 'llama-local/${apiModelId}'
  } finally {
    $env:OPENCODE_CONFIG_CONTENT = $previousConfig
    $env:LLAMA_API_KEY = $previousKey
  }
}
`;
}
module.exports={openCodeCommand};
