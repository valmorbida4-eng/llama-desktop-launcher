'use strict';
// Registro dos motores de inferência. O llama.cpp continua em engine.ts (download dos
// binários oficiais); aqui ficam a descrição de cada motor, a detecção de vLLM e
// Strata/PolyStrata, a busca dos modelos que cada um aceita e o comando de servidor.
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {apiModelId,isWithin}=require('./core');

// Versão do vLLM testada com o launcher (pip no Linux, imagem Docker no Windows).
const VLLM_VERSION='0.32.0';
const VLLM_IMAGE=`vllm/vllm-openai:v${VLLM_VERSION}`;
const VLLM_CONTAINER_PREFIX='llama-desktop-vllm-';
const ENGINE_IDS=['llamacpp','vllm','strata'];
const links={
  vllm:'https://docs.vllm.ai/en/latest/getting_started/installation/',
  docker:'https://docs.docker.com/desktop/features/gpu/',
  strata:'https://github.com/Niko1221/Strata',
  polystrata:'https://github.com/simplexai-labs/PolyStrata'
};

function vllmMode(platform=process.platform) {return platform==='linux'?'venv':platform==='win32'?'docker':null;}
function engineCatalog(platform=process.platform) {
  const strataSupported=platform==='win32'||platform==='linux';
  return [
    {id:'llamacpp',label:'llama.cpp',formats:'GGUF',supported:true,mode:'binary',browserPath:'/',features:{chat:true,cli:true,bench:true,tuning:true}},
    {id:'vllm',label:'vLLM',formats:'pasta Hugging Face (safetensors, AWQ, GPTQ)',supported:!!vllmMode(platform),mode:vllmMode(platform),browserPath:'/docs',features:{chat:false,cli:false,bench:false,tuning:false},
      unsupportedReason:'O vLLM roda no Linux (ambiente Python do launcher) e no Windows (Docker Desktop). No macOS ele não é oferecido.'},
    {id:'strata',label:'Strata / PolyStrata',formats:'configurações strata-*.json da pasta instalada',supported:strataSupported,mode:'folder',browserPath:'/',features:{chat:false,cli:false,bench:false,tuning:false},
      unsupportedReason:'Strata e PolyStrata são oferecidos no Windows e no Linux.'}
  ];
}
function engineInfo(id,platform=process.platform) {
  const info=engineCatalog(platform).find(item=>item.id===id);
  if(!info) throw Error('Motor desconhecido.');
  return info;
}

// vLLM no Linux: ambiente Python próprio do launcher (ou um já existente com bin/vllm).
function vllmExecutable(dir) {return path.join(dir,'bin','vllm');}
function vllmVenvReady(dir) {return !!dir && fs.existsSync(vllmExecutable(dir));}
function vllmInstallSteps(dir,python='python3') {
  const pip=path.join(dir,'bin','python');
  return [
    {label:'Criando ambiente Python',file:python,args:['-m','venv',dir]},
    {label:'Atualizando pip',file:pip,args:['-m','pip','install','--upgrade','pip']},
    {label:`Instalando vLLM ${VLLM_VERSION}`,file:pip,args:['-m','pip','install',`vllm==${VLLM_VERSION}`]}
  ];
}

function runStreaming(file,args,{cwd,env,onLog,spawnProcess=spawn}: any={}): Promise<void> {
  return new Promise<void>((resolve,reject)=>{
    let tail='';
    const child=spawnProcess(file,args,{cwd,env:env?{...process.env,...env}:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const take=chunk=>{const text=String(chunk);tail=(tail+text).slice(-800);onLog?.(text);};
    child.stdout?.on('data',take);child.stderr?.on('data',take);
    child.once('error',reject);
    child.once('exit',code=>code===0?resolve():reject(Error(`${path.basename(file)} falhou (${code}): ${tail.slice(-500)}`)));
  });
}
async function installVllm(dir,{python='python3',onLog,onStep,spawnProcess}: any={}) {
  if(fs.existsSync(dir)) throw Error('Já existe uma pasta nesse destino.');
  const steps=vllmInstallSteps(dir,python);
  try {
    for(let i=0;i<steps.length;i++) {
      onStep?.(Math.round(i/steps.length*100),steps[i].label);
      await runStreaming(steps[i].file,steps[i].args,{onLog,spawnProcess});
    }
  } catch(error) {
    await fs.promises.rm(dir,{recursive:true,force:true}).catch(()=>{});
    if(error.code==='ENOENT') throw Error('Python 3 não encontrado. Instale python3 e python3-venv (Python 3.10 a 3.13) e tente de novo.');
    throw error;
  }
  if(!vllmVenvReady(dir)) throw Error('A instalação terminou sem o comando vllm.');
  onStep?.(100,'vLLM pronto');
  return {path:dir,version:VLLM_VERSION};
}

// vLLM no Windows: Docker Desktop com GPU pelo WSL2.
function probe(file,args,{spawnProcess=spawn,timeoutMs=15000}: any={}): Promise<boolean> {
  return new Promise<boolean>(resolve=>{
    let child;
    try {child=spawnProcess(file,args,{windowsHide:true,stdio:'ignore'});} catch {resolve(false);return;}
    const timer=setTimeout(()=>{try{child.kill();}catch{}resolve(false);},timeoutMs);
    child.once('error',()=>{clearTimeout(timer);resolve(false);});
    child.once('exit',code=>{clearTimeout(timer);resolve(code===0);});
  });
}
async function dockerStatus(options: any={}) {
  const daemon=await probe('docker',['version','--format','{{.Server.Version}}'],options);
  const image=daemon&&await probe('docker',['image','inspect',VLLM_IMAGE],options);
  return {daemon,image,checked:true};
}
function pullVllmImage(onLog,options: any={}) {return runStreaming('docker',['pull',VLLM_IMAGE],{...options,onLog});}

// Strata (Niko1221/Strata) e PolyStrata (simplexai-labs/PolyStrata) compartilham o servidor
// serve/server.py e o ambiente .venv criados pelo instalador deles.
function strataPython(dir,platform=process.platform) {
  return platform==='win32'?path.join(dir,'.venv','Scripts','python.exe'):path.join(dir,'.venv','bin','python');
}
function detectStrata(dir,platform=process.platform) {
  if(!dir || !fs.existsSync(path.join(dir,'serve','server.py'))) return null;
  const python=strataPython(dir,platform);
  if(!fs.existsSync(python)) return null;
  const distribution=fs.existsSync(path.join(dir,'polystrata.py'))?'PolyStrata':'Strata';
  return {dir,python,distribution};
}
function contextFromArgs(args) {
  if(!Array.isArray(args)) return null;
  for(let i=0;i<args.length-1;i++) if(['-c','--ctx','--ctx-size','--context'].includes(String(args[i]))) {
    const value=Number(String(args[i+1]).replace(/k$/i,'000'));
    if(Number.isSafeInteger(value)&&value>0) return value;
  }
  return null;
}
function scanStrataConfigs(dir,platform=process.platform) {
  const install=detectStrata(dir,platform);
  if(!install) return [];
  const found=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    if(!entry.isFile() || !/^strata-.+\.json$/i.test(entry.name) || /\.shared-settings\.json$/i.test(entry.name)) continue;
    const file=path.join(dir,entry.name);
    let config: any={};
    try {if(fs.statSync(file).size<=1024*1024) config=JSON.parse(fs.readFileSync(file,'utf8'));} catch {continue;}
    if(!config || typeof config!=='object') continue;
    const stem=entry.name.replace(/^strata-/i,'').replace(/\.json$/i,'');
    const modelName=typeof config.model_name==='string'&&config.model_name.trim()?config.model_name.trim():stem;
    found.push({path:path.resolve(file),name:`${modelName} · ${install.distribution}`,size:0,projector:null,engine:'strata',modelName,
      context:contextFromArgs(config.args),distribution:install.distribution});
  }
  return found.sort((a,b)=>a.name.localeCompare(b.name));
}

// Modelos para o vLLM: pastas Hugging Face com config.json e pesos .safetensors.
function scanHfModels(roots) {
  const found=[],seen=new Set();
  for(const root of (roots||[]).filter(Boolean)) {
    if(!fs.existsSync(root)) continue;
    const todo=[root];
    while(todo.length) {
      const dir=todo.pop();
      let entries=[];try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{continue;}
      const weights=entries.filter(e=>e.isFile()&&/\.safetensors$/i.test(e.name));
      if(weights.length && entries.some(e=>e.isFile()&&e.name==='config.json')) {
        const resolved=path.resolve(dir);
        if(!seen.has(resolved)) {
          seen.add(resolved);
          let size=0;for(const w of weights){try{size+=fs.statSync(path.join(dir,w.name)).size;}catch{}}
          found.push({path:resolved,name:`${path.basename(dir)} · vLLM`,size,projector:null,engine:'vllm'});
        }
        continue;
      }
      for(const e of entries) if(e.isDirectory() && !e.name.startsWith('.')) todo.push(path.join(dir,e.name));
    }
  }
  return found.sort((a,b)=>a.name.localeCompare(b.name));
}

// Comando de servidor dos motores além do llama.cpp. A chave de API vai por variável de
// ambiente, nunca pela linha de comando, para não aparecer na lista de processos.
function serverCommand(model,settings,{host,port,parallel=1,key=null,platform=process.platform,vllmDir='',strataDir='',containerName=''}: any) {
  if(!host || !Number.isInteger(port) || port<1 || port>65535) throw Error('Endereço do servidor inválido.');
  if(host!=='127.0.0.1' && !key) throw Error('Chave de API obrigatória na rede.');
  const context=Number(settings?.context);
  if(!Number.isSafeInteger(context) || context<1) throw Error('Contexto inválido.');
  if(!Number.isInteger(parallel) || parallel<1 || parallel>8) throw Error('Sessões simultâneas inválidas.');
  if(model.engine==='vllm') {
    const mode=vllmMode(platform);
    const shared=['--served-model-name',apiModelId,'--max-model-len',String(context),'--max-num-seqs',String(parallel)];
    if(mode==='venv') {
      if(!vllmVenvReady(vllmDir)) throw Error('Instale o vLLM ou escolha um ambiente que contenha bin/vllm.');
      return {file:vllmExecutable(vllmDir),args:['serve',model.path,'--host',host,'--port',String(port),...shared],env:key?{VLLM_API_KEY:key}:{},cwd:vllmDir};
    }
    if(mode==='docker') {
      if(!/^[a-z0-9][a-z0-9_.-]{0,62}$/.test(containerName)) throw Error('Nome de contêiner inválido.');
      if(/,/.test(model.path)) throw Error('O caminho do modelo não pode conter vírgulas para uso no Docker.');
      const args=['run','--rm','--name',containerName,'--gpus','all','--ipc=host','-p',`${host}:${port}:8000`,
        '--mount',`type=bind,source=${model.path},target=/model,readonly`,'-e','HF_HUB_OFFLINE=1'];
      if(key) args.push('-e','VLLM_API_KEY');
      args.push(VLLM_IMAGE,'/model',...shared);
      return {file:'docker',args,env:key?{VLLM_API_KEY:key}:{},cwd:undefined,containerName};
    }
    throw Error(engineInfo('vllm',platform).unsupportedReason);
  }
  if(model.engine==='strata') {
    const install=detectStrata(strataDir,platform);
    if(!install) throw Error('Escolha a pasta de uma instalação do Strata ou do PolyStrata (com serve/server.py e .venv).');
    if(!isWithin(strataDir,model.path)) throw Error('A configuração precisa estar na pasta do Strata.');
    return {file:install.python,args:[path.join('serve','server.py'),'--engine','strata','--config',model.path,'--host',host,'--port',String(port)],
      env:key?{STRATA_API_KEY:key}:{},cwd:strataDir};
  }
  throw Error('Este motor usa o comando do llama.cpp.');
}
function stopCommand(active) {
  if(!active?.containerName) return null;
  if(!active.containerName.startsWith(VLLM_CONTAINER_PREFIX)) throw Error('Contêiner inválido.');
  return {file:'docker',args:['stop','-t','30',active.containerName]};
}

module.exports={VLLM_VERSION,VLLM_IMAGE,VLLM_CONTAINER_PREFIX,ENGINE_IDS,links,vllmMode,engineCatalog,engineInfo,vllmExecutable,vllmVenvReady,vllmInstallSteps,
  installVllm,runStreaming,dockerStatus,pullVllmImage,strataPython,detectStrata,contextFromArgs,scanStrataConfigs,scanHfModels,serverCommand,stopCommand};
