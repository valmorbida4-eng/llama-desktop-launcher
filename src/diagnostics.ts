'use strict';
// Relatório de diagnóstico que o usuário copia para pedir ajuda: versões, sistema, motores,
// pastas, servidor ativo e o fim do registro do motor. Nada sai daqui sem passar por redact():
// chaves conhecidas, tokens, cabeçalhos Bearer, variáveis *_API_KEY/*_TOKEN e a pasta pessoal.

const LOG_BUFFER_LIMIT=60000;
const REPORT_LOG_LIMIT=12000;
const REDACTED='[REMOVIDO]';

// Guarda o fim do registro do motor no processo principal; a janela só recebe pedaços dele.
function createLogBuffer(limit=LOG_BUFFER_LIMIT) {
  let text='';
  return {
    append(chunk) {text=(text+String(chunk)).slice(-limit);},
    clear() {text='';},
    text() {return text;}
  };
}

function escapeRegExp(value) {return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

function redact(input,{secrets=[],home=''}: {secrets?: (string|null|undefined)[]; home?: string}={}) {
  let text=String(input??'');
  for(const secret of secrets) if(typeof secret==='string'&&secret.length>=8) text=text.split(secret).join(REDACTED);
  text=text
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi,`$1${REDACTED}`)
    .replace(/([?#&](?:token|key|api_key|access_token)=)[^\s&#"']+/gi,`$1${REDACTED}`)
    .replace(/\b([A-Za-z0-9_]*(?:api[_-]?key|token|secret|password)["']?\s*[=:]\s*["']?)[^\s"',}]+/gi,`$1${REDACTED}`)
    .replace(/\bhf_[A-Za-z0-9]{20,}/g,REDACTED)
    .replace(/\bsk-[A-Za-z0-9_-]{20,}/g,REDACTED)
    .replace(/(llama_(?:token|share)=)[^\s;]+/g,`$1${REDACTED}`);
  if(home&&home.length>3) {
    // Troca a pasta pessoal por ~ nas duas grafias de barra; no Windows o caminho não diferencia maiúsculas.
    // Só quando o nome termina ali: com home /home/ana, /home/anabela fica como está.
    const base=home.replace(/[\\/]+$/,'');
    const variants=new Set([base,base.replace(/\\/g,'/'),base.replace(/\//g,'\\')]);
    for(const variant of variants) text=text.replace(new RegExp(escapeRegExp(variant)+'(?=[\\\\/]|$|[\\s"\'`,;:)\\]}])','gim'),'~');
  }
  return text;
}

function gib(bytes) {return Number.isFinite(bytes)&&bytes>0?`${(bytes/1024**3).toFixed(1)} GB`:'não medida';}
function yes(value) {return value?'sim':'não';}

// data é montado pelo main.ts; aqui só formatamos, para o teste cobrir o texto sem Electron.
function buildReport(data: any) {
  const lines: string[]=[];
  const add=(text='')=>lines.push(text);
  add('# Relatório de diagnóstico — Llama Desktop Launcher');
  add(`Gerado em: ${data.generatedAt}`);
  add('Chaves de API, tokens e a pasta pessoal (~) foram removidos. Revise antes de enviar.');
  add();
  add('## Aplicativo e sistema');
  add(`- Launcher: v${data.app.version}${data.app.packaged?'':' (execução de desenvolvimento)'}`);
  add(`- Electron ${data.app.electron||'?'} · Node ${data.app.node||'?'}`);
  add(`- Sistema: ${data.system.platform} ${data.system.arch} · ${data.system.release}${data.system.version?` · ${data.system.version}`:''}`);
  add(`- CPU: ${data.hardware.cpu||'?'} · ${data.hardware.logicalCores||'?'} threads · RAM ${gib(data.hardware.memoryBytes)}`);
  add(`- GPU: ${data.gpu?.name||'não identificada'} · VRAM ${gib(data.gpu?.memoryBytes)}${data.gpu?.source?` (fonte: ${data.gpu.source})`:''}`);
  add();
  add('## Motores');
  for(const engine of data.engines||[]) {
    const state=!engine.supported?'indisponível nesta plataforma':engine.ready?'pronto':'pendente';
    add(`- ${engine.label}${engine.version?` ${engine.version}`:''}: ${state}${engine.mode?` · modo ${engine.mode}`:''}`);
    if(engine.detail) add(`  - ${engine.detail}`);
    if(!engine.supported&&engine.unsupportedReason) add(`  - ${engine.unsupportedReason}`);
  }
  if(data.llama) add(`- llama.cpp configurado: backend ${data.llama.backend||'—'} · release ${data.llama.release||'—'} · versão testada ${data.llama.pinned}`);
  if(data.docker) add(`- Docker: verificado ${yes(data.docker.checked)} · serviço ativo ${yes(data.docker.daemon)} · imagem do vLLM ${yes(data.docker.image)}`);
  add();
  add('## Pastas');
  add(`- Dados do aplicativo: ${data.paths.userData}`);
  (data.paths.modelDirs||[]).forEach((dir: any,index: number)=>add(`- Modelos ${index+1}: ${dir.path||'não configurada'}${dir.path?` (${dir.exists?'existe':'não encontrada'})`:''}`));
  add(`- Chave de API salva: ${yes(data.paths.apiKeySaved)}`);
  add();
  add('## Modelos');
  const counts=Object.entries(data.models.byEngine||{}).map(([id,count])=>`${id}: ${count}`).join(' · ')||'nenhum';
  add(`- Encontrados: ${data.models.total} (${counts})`);
  if(data.models.selected) {
    const m=data.models.selected;
    add(`- Selecionado: ${m.name} · motor ${m.engine}${m.size?` · ${gib(m.size)}`:''}`);
    add(`- Caminho: ${m.path}`);
    add(`- Perfil: ${m.profile?JSON.stringify(m.profile):'sem perfil salvo'}`);
  } else add('- Selecionado: nenhum');
  add();
  add('## Execução');
  add(`- Endereço escolhido: ${data.access.scope||'?'} (${data.access.host}) · sessões simultâneas ${data.access.parallel}`);
  add(`- Servidor ativo: ${yes(data.run.server)} · conversa integrada: ${yes(data.run.chat)} · teste de desempenho: ${yes(data.run.benchmark)} · preparando motor: ${yes(data.run.engineBusy)}`);
  if(data.run.active) {
    const a=data.run.active;
    add(`- Motor ${a.engineLabel} · ${a.scope} ${a.host}:${a.port} · ID do modelo na API ${a.modelId} · contexto ${a.context} · sessões ${a.parallel}`);
    add(`- Compartilhamento: ${a.sharing?'ativo':'inativo'}${a.container?` · contêiner ${a.container}`:''}`);
  }
  add();
  add('## Atualizações');
  add(`- Verificação automática: ${yes(data.update.enabled)} · última verificação: ${data.update.lastCheck||'nunca'}`);
  add(`- ${data.update.available?`Versão ${data.update.version} disponível`:data.update.checked?'Nenhuma versão mais nova encontrada':'Sem verificação nesta sessão'}`);
  add();
  add(`## Registro do motor (últimos ${REPORT_LOG_LIMIT} caracteres)`);
  const log=String(data.log||'').slice(-REPORT_LOG_LIMIT).trim();
  add('```');
  add(log||'(vazio: nenhum servidor ou instalação nesta execução do launcher)');
  add('```');
  return redact(lines.join('\n')+'\n',{secrets:data.secrets,home:data.home});
}

module.exports={LOG_BUFFER_LIMIT,REPORT_LOG_LIMIT,REDACTED,createLogBuffer,redact,buildReport};
