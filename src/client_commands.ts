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

const applications={
 opencode:{name:'OpenCode',command:true,hint:'Cole Bash ou PowerShell no terminal, dentro da pasta do projeto. Requer OpenCode instalado.'},
 aider:{name:'Aider',command:true,hint:'Cole Bash ou PowerShell no terminal, dentro da pasta do projeto. Requer Aider instalado.'},
 pi:{name:'Pi',command:false,hint:'Mescle a configuração em ~/.pi/agent/models.json, preservando os providers existentes. Selecione llama-local/modelo-local em /model.'},
 hermes:{name:'Hermes',command:false,hint:'Mescle o bloco model no config.yaml do Hermes; depois execute hermes chat na pasta do projeto.'},
 continue:{name:'Continue',command:false,hint:'Mescle o bloco models no config.yaml do Continue, preservando os modelos existentes.'},
 cline:{name:'Cline',command:false,hint:'Nas configurações, escolha OpenAI Compatible e preencha Base URL, API Key e Model ID com os dados copiados.'},
 codex:{name:'Codex (requer Responses API)',command:false,hint:'Configuração experimental para ~/.codex/config.toml. Exige servidor ou adaptador compatível com Responses API; a conexão com este motor ainda não foi validada.'},
 generic:{name:'Genérico — OpenAI Compatible',command:false,hint:'Use endpoint, chave e modelo nos campos do cliente. Requer Chat Completions e suporte a ferramentas compatível com o modelo.'}
};
function clientConfiguration(connection,application,accessKey=null){
 if(!Object.hasOwn(applications,application))throw Error('Aplicativo inválido.');
 // Reuse endpoint, context and credential validation before constructing any export.
 openCodeCommand(connection,'bash',accessKey);
 const context=Math.floor(Number(connection.context)/Number(connection.parallel||1)),output=Math.min(1024,Math.floor(context/2));
 const key=accessKey||(connection.scope==='Local'?'local':'SUBSTITUA_PELA_CHAVE_DA_API');
 const q=value=>JSON.stringify(value);
 if(application==='pi')return JSON.stringify({providers:{'llama-local':{baseUrl:connection.endpoint,api:'openai-completions',apiKey:key,models:[{id:apiModelId,name:'Modelo local',contextWindow:context,maxTokens:output,input:['text'],reasoning:false,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}]}}},null,2)+'\n';
 if(application==='hermes')return `# Hermes atual requer pelo menos 64000 tokens por sessão para ferramentas.\nmodel:\n  default: ${q(apiModelId)}\n  provider: custom\n  context_length: ${context}\n  base_url: ${q(connection.endpoint)}\n  api_key: ${q(key)}\n`;
 if(application==='continue')return `# Mescle este bloco na configuração existente.\nmodels:\n  - name: Modelo local\n    provider: openai\n    model: ${q(apiModelId)}\n    apiBase: ${q(connection.endpoint)}\n    apiKey: ${q(key)}\n    useResponsesApi: false\n    defaultCompletionOptions:\n      contextLength: ${context}\n      maxTokens: ${output}\n`;
 if(application==='codex')return `# EXPERIMENTAL: requer Responses API; não validado com este motor.\n# Defina LLAMA_API_KEY no ambiente antes de iniciar Codex.\n# Chave de acesso: ${key}\nmodel = ${q(apiModelId)}\nmodel_provider = "llama-local"\nmodel_context_window = ${context}\n\n[model_providers.llama-local]\nname = "Modelo local"\nbase_url = ${q(connection.endpoint)}\nenv_key = "LLAMA_API_KEY"\nwire_api = "responses"\n`;
 if(application==='opencode')return JSON.stringify({model:'llama-local/'+apiModelId,provider:{'llama-local':{npm:'@ai-sdk/openai-compatible',options:{baseURL:connection.endpoint,apiKey:key},models:{[apiModelId]:{limit:{context,output}}}}}},null,2)+'\n';
 return `Provider: OpenAI Compatible\nBase URL: ${connection.endpoint}\nAPI Key: ${key}\nModel ID: ${apiModelId}\nContext window: ${context}\nMax output tokens: ${output}\nAPI: Chat Completions\n`;
}
function clientCommand(connection,application,platform,accessKey=null){
 if(!Object.hasOwn(applications,application)||!applications[application].command)throw Error('Este aplicativo usa Copiar configuração.');
 const original=openCodeCommand(connection,platform,accessKey);
 if(application==='opencode')return original;
 // Keep the same scoped credential handling and restore environment after Aider exits.
 return original.replace(/  export OPENCODE_CONFIG_CONTENT=.*\n/,'  export OPENAI_API_BASE='+bashQuote(connection.endpoint)+'\n')
 .replace('  $previousConfig = $env:OPENCODE_CONFIG_CONTENT','  $previousConfig = $env:OPENAI_API_BASE')
 .replace('  $previousKey = $env:LLAMA_API_KEY','  $previousKey = $env:OPENAI_API_KEY')
 .replace(/    \$env:OPENCODE_CONFIG_CONTENT = .*\n/,'    $env:OPENAI_API_BASE = '+psQuote(connection.endpoint)+'\n')
 .replace('    $env:OPENCODE_CONFIG_CONTENT = $previousConfig','    $env:OPENAI_API_BASE = $previousConfig')
 .replaceAll('LLAMA_API_KEY','OPENAI_API_KEY').replaceAll('Requer OpenCode','Requer Aider')
 .replaceAll("opencode --model 'llama-local/"+apiModelId+"'","aider --model 'openai/"+apiModelId+"'");
}
module.exports={openCodeCommand,applications,clientConfiguration,clientCommand};
