'use strict';
// Ferramentas do llama.cpp que o launcher roda sem abrir o servidor (llama-fit-params, --list-devices,
// llama-bench) e o autotuning: busca coordenada dentro de um orçamento de tempo, com cancelamento.
// Etapa 1 mede com llama-bench; etapa 2 sobe um llama-server curto para o que o llama-bench não mede
// (-tb, --moe-cache-mib e decodificação especulativa). O vLLM usa a mesma busca com servidores completos.
const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const http=require('node:http');
const net=require('node:net');
const core=require('./core');
const params=require('./params');

const exe=(dir: string,name: string)=>path.join(dir,process.platform==='win32'?`${name}.exe`:name);
type RunResult = {stdout: string; stderr: string};
function execute(file: string,args: string[],{timeoutMs=600000,signal,cwd}: {timeoutMs?: number; signal?: AbortSignal; cwd?: string}={}): Promise<RunResult> {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(Error('Teste cancelado.'));return;}
    const p=spawn(file,args,{cwd:cwd||path.dirname(file),windowsHide:true});
    let stdout='',stderr='',done=false;
    const finish=(error: Error | null)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);error?reject(error):resolve({stdout,stderr});};
    const onAbort=()=>{try{p.kill();}catch{}finish(Error('Teste cancelado.'));};
    signal?.addEventListener('abort',onAbort,{once:true});
    const timer=setTimeout(()=>{try{p.kill();}catch{}finish(Error(`${path.basename(file)} excedeu o tempo limite.`));},timeoutMs);
    p.stdout.on('data',d=>{if(stdout.length<4e6)stdout+=d.toString();});
    p.stderr.on('data',d=>{stderr=(stderr+d.toString()).slice(-8000);});
    p.once('error',e=>finish(e));
    p.once('exit',code=>finish(code===0?null:Error(`${path.basename(file)} falhou: ${stderr.slice(-700)}`)));
  });
}

// Dispositivos que o llama.cpp instalado enxerga (nome, memória total e livre).
async function listDevices(engineDir: string,{run=execute}: any={}) {
  const file=exe(engineDir,'llama-server');
  if(!fs.existsSync(file)) return null;
  const out=await run(file,['--list-devices'],{timeoutMs:30000});
  return params.parseDevices(`${out.stdout}\n${out.stderr}`);
}
// Valores que o -fit escolheria (camadas, contexto, divisão e especialistas na CPU) para os ajustes atuais.
async function fitParams(engineDir: string,model: any,settings: any,{info=null,run=execute,signal}: any={}) {
  const file=exe(engineDir,'llama-fit-params');
  if(!fs.existsSync(file)) throw Error('Este pacote do llama.cpp não inclui llama-fit-params.');
  core.validateSettings(settings);
  const out=await run(file,['-m',model.path,...params.llamaArgs(settings,'fit')],{timeoutMs:180000,signal});
  const fit=params.parseFitOutput(out.stdout,info?.blockCount||null);
  if(!fit) throw Error(`llama-fit-params não informou os valores: ${(out.stderr||out.stdout).slice(-400)}`);
  return fit;
}

const list=(value: unknown)=>String(value).replace(/,/g,'/');
function benchArgs(model: any,settings: any,{prompt=256,generate=48}: any={}) {
  const s=settings||{},set=(key: string)=>!params.isAuto(params.FIELDS.find(f=>f.engine==='llamacpp'&&f.key===key),s[key]);
  const a=['-m',model.path,'-p',String(prompt),'-n',String(generate),'-r','1','-o','json'];
  if(set('batch'))a.push('-b',String(s.batch));
  if(set('ubatch'))a.push('-ub',String(s.ubatch));
  if(set('cacheK'))a.push('-ctk',s.cacheK);
  if(set('cacheV'))a.push('-ctv',s.cacheV);
  if(set('flash'))a.push('-fa',s.flash);
  if(set('gpuLayers'))a.push('-ngl',s.gpuLayers==='all'?'999':String(s.gpuLayers));
  else a.push('-fitt',String(set('fitTarget')?s.fitTarget:1024));
  if(set('cpuMoe'))a.push('-ncmoe',String(s.cpuMoe));
  if(set('threads'))a.push('-t',String(s.threads));
  if(set('device'))a.push('-dev',list(s.device));
  if(set('splitMode'))a.push('-sm',s.splitMode);
  if(set('tensorSplit'))a.push('-ts',list(s.tensorSplit));
  if(set('noKvOffload'))a.push('-nkvo',s.noKvOffload==='on'?'1':'0');
  if(set('loadMode'))a.push('-lm',s.loadMode);
  return a;
}
function parseBench(stdout: string) {
  const data=JSON.parse(stdout);const rows=Array.isArray(data)?data:data.results||[];
  const prompt=rows.find(r=>r.n_prompt>0&&r.n_gen===0),generation=rows.find(r=>r.n_gen>0&&r.n_prompt===0);
  if(!prompt||!generation) throw Error('Resultado de benchmark incompleto.');
  return {promptTps:prompt.avg_ts,generationTps:generation.avg_ts};
}
async function runBench(engineDir: string,model: any,settings: any,{signal,timeoutMs=600000,run=execute}: any={}) {
  const file=exe(engineDir,'llama-bench');
  return parseBench((await run(file,benchArgs(model,settings),{timeoutMs,signal})).stdout);
}

// Servidor curto: sobe, espera /health, mede e encerra (esperando o processo sair para liberar a VRAM).
function freePort(): Promise<number> {return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});}
function requestJson(port: number,pathName: string,body: any,timeoutMs: number,signal?: AbortSignal): Promise<any> {
  return new Promise((resolve,reject)=>{
    const data=Buffer.from(JSON.stringify(body));
    const req=http.request({hostname:'127.0.0.1',port,path:pathName,method:body?'POST':'GET',timeout:timeoutMs,signal,headers:body?{'Content-Type':'application/json','Content-Length':data.length}:{}},res=>{
      let text='';res.on('data',d=>{if(text.length<2e6)text+=d;});
      res.on('end',()=>{if(res.statusCode!==200){reject(Error(`HTTP ${res.statusCode}: ${text.slice(0,300)}`));return;}try{resolve(JSON.parse(text));}catch{reject(Error('Resposta inválida do servidor.'));}});
    });
    req.on('timeout',()=>req.destroy(Error('O servidor não respondeu a tempo.')));
    req.on('error',reject);if(body)req.write(data);req.end();
  });
}
function waitHealth(port: number,child: any,timeoutMs: number,signal?: AbortSignal): Promise<void> {
  return new Promise((resolve,reject)=>{
    const started=Date.now();let done=false;
    const finish=(error?: Error)=>{if(done)return;done=true;clearInterval(timer);error?reject(error):resolve();};
    const timer=setInterval(()=>{
      if(signal?.aborted){finish(Error('Teste cancelado.'));return;}
      if(child.exitCode!==null){finish(Error('O motor encerrou antes de ficar pronto (memória insuficiente ou opção recusada).'));return;}
      if(Date.now()-started>timeoutMs){finish(Error('Tempo esgotado ao carregar o modelo.'));return;}
      http.get({hostname:'127.0.0.1',port,path:'/health',timeout:2000},r=>{r.resume();if(r.statusCode===200)finish();}).on('error',()=>{});
    },1000);
  });
}
function waitExit(child: any,ms=30000) {return new Promise<void>(resolve=>{if(child.exitCode!==null||child.signalCode){resolve();return;}const t=setTimeout(resolve,ms);child.once('exit',()=>{clearTimeout(t);resolve();});});}
async function probeServer({command,port,timeoutMs,signal,measure,stop,spawnProcess=spawn}: any) {
  const child=spawnProcess(command.file,command.args,{cwd:command.cwd,env:{...process.env,...(command.env||{})},windowsHide:true,stdio:['ignore','ignore','pipe']});
  let tail='';child.stderr?.on('data',(d: Buffer)=>{tail=(tail+d.toString()).slice(-1500);});
  child.once('error',()=>{});
  try {
    await waitHealth(port,child,timeoutMs,signal);
    return await measure(port);
  } catch(error) {
    const reason=/out of memory|failed to allocate|cudaMalloc|OOM/i.test(tail)?'não coube na memória':(tail.trim().split(/\r?\n/).pop()||'').slice(0,240);
    throw Error(reason?`${error.message} ${reason}`:error.message);
  } finally {
    try{stop?.();}catch{}
    try{child.kill();}catch{}
    await waitExit(child);
  }
}
const PROBE_PROMPT='Escreva em Python uma função que recebe uma lista de pedidos (id, cliente, valor, status) e devolve o total por cliente só dos pedidos pagos. '+
  'Depois escreva testes com pytest para listas vazias, um cliente, vários clientes e status diferentes. Explique cada passo em uma frase.';
// llama-server: os timings da resposta trazem tokens/s de prompt e de geração e a aceitação do rascunho.
async function measureLlamaServer(port: number,signal?: AbortSignal) {
  // Aquecimento com o mesmo tamanho de prompt: o primeiro lote paga compilação de shaders e grafos.
  const prompt=PROBE_PROMPT.repeat(4);
  await requestJson(port,'/completion',{prompt,n_predict:8,cache_prompt:false},300000,signal);
  const r=await requestJson(port,'/completion',{prompt,n_predict:160,cache_prompt:false,temperature:0},300000,signal);
  const t=r.timings||{};
  if(!Number.isFinite(t.predicted_per_second)) throw Error('O servidor não informou os tempos.');
  return {promptTps:t.prompt_per_second,generationTps:t.predicted_per_second,draftAcceptance:t.draft_n?t.draft_n_accepted/t.draft_n:null};
}
// Servidor OpenAI (vLLM): prefill com prompt longo e 1 token; geração com prompt curto e 160 tokens.
async function measureOpenAi(port: number,signal?: AbortSignal,model=core.apiModelId) {
  await requestJson(port,'/v1/completions',{model,prompt:'Olá',max_tokens:4},300000,signal);
  let t=Date.now();
  const prefill=await requestJson(port,'/v1/completions',{model,prompt:PROBE_PROMPT.repeat(12),max_tokens:1,temperature:0},300000,signal);
  const promptSeconds=(Date.now()-t)/1000;
  t=Date.now();
  const gen=await requestJson(port,'/v1/completions',{model,prompt:PROBE_PROMPT,max_tokens:160,temperature:0,ignore_eos:true},300000,signal);
  const genSeconds=(Date.now()-t)/1000;
  return {promptTps:(prefill.usage?.prompt_tokens||0)/Math.max(promptSeconds,0.001),generationTps:(gen.usage?.completion_tokens||0)/Math.max(genSeconds,0.001)};
}
async function probeLlamaServer(engineDir: string,model: any,settings: any,{signal,timeoutMs=600000,spawnProcess}: any={}) {
  const port=await freePort();
  const args=core.argsForModel(model,settings,'server',port,{host:'127.0.0.1',parallel:1});
  return probeServer({command:{file:exe(engineDir,'llama-server'),args,cwd:engineDir},port,timeoutMs,signal,spawnProcess,measure:(p: number)=>measureLlamaServer(p,signal)});
}

function scoreOf(r: {promptTps: number; generationTps: number},priority='generation') {
  const g=Number(r.generationTps)||0,p=Number(r.promptTps)||0;
  if(priority==='prompt') return p+g/10;
  if(priority==='balanced') return Math.sqrt(Math.max(g,0)*Math.max(p,0));
  return g+p/100;
}
const PRIORITIES=['generation','prompt','balanced'];

// Busca coordenada genérica: cada etapa testa candidatos para algumas chaves, mantendo o melhor.
function createSearch({priority,deadline,signal,onProgress}: any) {
  const results: any[]=[];const seen=new Map<string, any>();
  let stopped: string | null=null;
  async function measure(settings: any,changes: Record<string, string>,method: string,label: string,run: (s: any, timeoutMs: number) => Promise<any>) {
    // Vazio = automático: {flash:''} e {} são a mesma configuração.
    const key=method+JSON.stringify(Object.entries(settings).filter(([,v])=>v!==''&&v!=null).sort(([a],[b])=>a.localeCompare(b)));
    if(seen.has(key)) return seen.get(key);
    if(signal?.aborted){stopped='cancelled';return null;}
    const remaining=deadline-Date.now();
    if(remaining<15000){stopped='budget';return null;}
    onProgress?.(`${label} · ${Math.ceil(remaining/60000)} min restantes`);
    let row: any={label,method,changes};
    try {
      const m=await run(settings,remaining);
      row={...row,...m,score:scoreOf(m,priority)};
    } catch(error) {
      if(signal?.aborted){stopped='cancelled';return null;}
      if(Date.now()>=deadline){stopped='budget';return null;}
      row.error=error.message;
    }
    results.push(row);seen.set(key,row);return row;
  }
  async function stage(base: any,candidates: Record<string, string>[],method: string,describe: (c: Record<string, string>) => string,run: any) {
    let best=null,bestSettings=base;
    for(const changes of candidates) {
      if(stopped) break;
      const settings={...base,...changes};
      try{core.validateSettings(settings);}catch(error){results.push({label:describe(changes),method,changes,error:error.message});continue;}
      const row=await measure(settings,changes,method,describe(changes),run);
      // O primeiro candidato é o valor atual; outro só o substitui com ganho acima do ruído de medição.
      if(row&&Number.isFinite(row.score)&&(!best||row.score>best.score*MIN_GAIN)){best=row;bestSettings=settings;}
    }
    return {best,settings:bestSettings};
  }
  return {results,measure,stage,get stopped(){return stopped;}};
}
// Ganho mínimo para trocar um valor: medições de 1 repetição variam 1 a 2% entre si.
const MIN_GAIN=1.02;
const uniq=(values: string[])=>[...new Set(values.filter(v=>v!==undefined&&v!==null))];

// Autotuning do llama.cpp. Retorna os ajustes sugeridos (não salva), as medições e o motivo da parada.
async function tune(engineDir: string,model: any,settings: any,onProgress?: (text: string) => void,signal?: AbortSignal,options: any={}) {
  core.validateSettings(settings);
  const {budgetMinutes=10,priority='generation',info=null,devices=null,hw=core.detectHardware(),deps={}}=options;
  if(!PRIORITIES.includes(priority)) throw Error('Prioridade inválida.');
  if(!(Number(budgetMinutes)>=1&&Number(budgetMinutes)<=120)) throw Error('Orçamento de tempo inválido.');
  const bench=deps.bench||((s: any,t: number)=>runBench(engineDir,model,s,{signal,timeoutMs:Math.min(t,600000)}));
  if(!deps.bench&&!fs.existsSync(exe(engineDir,'llama-bench'))) throw Error('Este pacote não inclui llama-bench.');
  const server=deps.server||(fs.existsSync(exe(engineDir,'llama-server'))?(s: any,t: number)=>probeLlamaServer(engineDir,model,s,{signal,timeoutMs:Math.min(t,600000)}):null);
  const fitRun=deps.fit||((s: any)=>fitParams(engineDir,model,s,{info,signal}));
  const deadline=Date.now()+Number(budgetMinutes)*60000;
  const search=createSearch({priority,deadline,signal,onProgress});
  const known=info&&!info.error?info:{};
  const moe=known.expertCount>0,gpu=devices==null||devices.length>0,blocks=known.blockCount||null;
  const physical=hw.physicalCores||Math.max(1,Math.floor((hw.logicalCores||2)/2)),logical=hw.logicalCores||physical*2;

  // 0. Teto de memória pelo -fit.
  onProgress?.('Calculando o teto de memória com llama-fit-params…');
  let fit=null;
  try{fit=await fitRun(settings);}catch(error){if(signal?.aborted)throw Error('Teste cancelado.');search.results.push({label:'Ajuste automático (fit)',method:'llama-fit-params',error:error.message});}
  const auto=(key: string)=>params.isAuto(params.FIELDS.find(f=>f.engine==='llamacpp'&&f.key===key),settings[key]);
  let base={...settings};
  if(gpu&&fit&&auto('gpuLayers')) base.gpuLayers=fit.ngl;
  if(moe&&gpu&&fit&&auto('cpuMoe')) base.cpuMoe=String(fit.cpuMoe||0);
  const tuned=new Set<string>();

  // 1. llama-bench.
  const benchStage=async(candidates: Record<string, string>[],describe: (c: Record<string, string>) => string)=>{
    const r=await search.stage(base,candidates,'llama-bench',describe,bench);
    if(r.best){base=r.settings;for(const c of candidates)for(const k of Object.keys(c))tuned.add(k);}
    return r.best;
  };
  const first=await benchStage([{}],()=>'Medição inicial (llama-bench)');
  if(!first&&!search.stopped&&!search.results.some(r=>Number.isFinite(r.score)))
    throw Error(`A configuração atual não rodou no llama-bench: ${search.results.map(r=>r.error).filter(Boolean).join('; ')}`);
  if(moe&&gpu) {
    // Subida de encosta de 2 em 2 camadas: o -fit não é sempre o mais rápido (ex.: com GPU integrada,
    // tirar especialistas dela e pôr na CPU acelerou). Anda na direção que melhora até parar de ganhar.
    const k=Number(base.cpuMoe||0),max=blocks||k+16,describe=(c: Record<string, string>)=>`Especialistas na CPU: ${c.cpuMoe} camadas`;
    await benchStage(uniq([k,k-2,k+2].filter(v=>v>=0&&v<=max).map(String)).map(v=>({cpuMoe:v})),describe);
    const step=Math.sign(Number(base.cpuMoe||0)-k)*2;
    while(step&&!search.stopped) {
      const current=String(base.cpuMoe||0),next=Number(current)+step;
      if(next<0||next>max) break;
      await benchStage([{cpuMoe:current},{cpuMoe:String(next)}],describe);
      if(String(base.cpuMoe)===current) break;
    }
  }
  await benchStage(uniq([base.flash||'','on','off']).map(v=>({flash:v})),c=>`Flash Attention: ${c.flash||'auto'}`);
  const caches=[['',''],['q8_0','q8_0'],['q4_0','q4_0']].filter(([,v])=>!(params.QUANTIZED_CACHE.has(v)&&base.flash==='off'));
  await benchStage([{cacheK:base.cacheK||'',cacheV:base.cacheV||''},...caches.map(([k,v])=>({cacheK:k,cacheV:v}))],c=>`Cache K/V: ${c.cacheK||'f16'}/${c.cacheV||'f16'}`);
  const batch=Number(base.batch||2048);
  // '' = 512 (padrão do llama.cpp): não mede o mesmo valor duas vezes.
  await benchStage(uniq([String(base.ubatch||''),'','256','1024']).filter(v=>v===''||Number(v)<=batch).map(v=>({ubatch:v})),c=>`Microbatch: ${c.ubatch||'512 (auto)'}`);
  const cpuWork=!gpu||Number(base.cpuMoe||0)>0||(blocks&&base.gpuLayers!=='all'&&Number(base.gpuLayers)<blocks);
  if(cpuWork) await benchStage(uniq([String(base.threads||''),String(physical),String(Math.max(1,physical-2)),String(Math.max(1,Math.ceil(physical/2))),String(logical)]).map(v=>({threads:v})),c=>`Threads: ${c.threads||physical}`);
  if(devices&&devices.length>=2) await benchStage(uniq([base.splitMode||'','','row']).map(v=>({splitMode:v})),c=>`Divisão entre GPUs: ${c.splitMode||'layer (auto)'}`);

  // 2. llama-server curto, só com tempo sobrando e quando há o que medir.
  const serverKeys: Record<string, string>[][]=[];
  const specs=['none','ngram-mod',...(known.nextnLayers>0?['draft-mtp']:[])];
  serverKeys.push(specs.map(v=>({specType:v==='none'?'':v})));
  if(cpuWork) serverKeys.push(uniq([String(base.threadsBatch||''),String(base.threads||physical),String(logical)]).map(v=>({threadsBatch:v})));
  if(moe&&gpu&&Number(base.cpuMoe||0)>0) serverKeys.push(['0','1024','2048','4096'].map(v=>({moeCacheMib:v==='0'?'':v})));
  if(server&&!search.stopped) {
    const describe=(c: Record<string, string>)=>c.specType!==undefined?`Especulativa: ${c.specType||'none'}${c.draftMax?` · ${c.draftMax} tokens`:''}`:c.threadsBatch!==undefined?`Threads de prompt: ${c.threadsBatch||'= geração'}`:c.moeCacheMib!==undefined?`Cache MoE na GPU: ${c.moeCacheMib||0} MiB`:'Servidor';
    let serverBase=base;
    const serverStage=async(candidates: Record<string, string>[])=>{
      const r=await search.stage(serverBase,candidates,'llama-server',describe,server);
      if(r.best){serverBase=r.settings;for(const c of candidates)for(const k of Object.keys(c))tuned.add(k);}
      return r;
    };
    for(const candidates of serverKeys){if(search.stopped)break;await serverStage(candidates);}
    if(!search.stopped&&String(serverBase.specType||'').startsWith('draft-')) await serverStage(['2','3','4'].map(v=>({specType:serverBase.specType,draftMax:v})));
    base=serverBase;
  }

  const valid=search.results.filter(r=>Number.isFinite(r.score));
  if(!valid.length) {
    if(search.stopped==='cancelled') throw Error('Teste cancelado.');
    throw Error(`Nenhuma configuração passou no teste: ${search.results.map(r=>r.error).filter(Boolean).join('; ')}`);
  }
  // Só as chaves testadas mudam; camadas na GPU voltam ao automático quando eram automáticas (o -fit do
  // servidor recalcula com os especialistas e o cache escolhidos).
  const result={...settings};
  for(const key of tuned) result[key]=base[key]??'';
  if(auto('gpuLayers')) result.gpuLayers=settings.gpuLayers;
  const best=valid.reduce((a,b)=>b.score>a.score?b:a);
  return {settings:result,results:search.results,best,fit,priority,stopped:search.stopped||'done'};
}

// Autotuning do vLLM: cada candidato sobe o servidor de novo (minutos por tentativa).
async function tuneVllm(model: any,settings: any,{probe,info=null,gpuCount=null,budgetMinutes=20,priority='generation',onProgress,signal}: any) {
  if(!PRIORITIES.includes(priority)) throw Error('Prioridade inválida.');
  if(!(Number(budgetMinutes)>=1&&Number(budgetMinutes)<=120)) throw Error('Orçamento de tempo inválido.');
  params.validateParams(settings,{engine:'vllm',info,gpuCount});
  const deadline=Date.now()+Number(budgetMinutes)*60000;
  const search=createSearch({priority,deadline,signal,onProgress});
  const known=info&&!info.error?info:{};
  let base={...settings};const tuned=new Set<string>();
  const run=(s: any,t: number)=>probe(s,Math.min(t,1800000));
  const step=async(candidates: Record<string, string>[],describe: (c: Record<string, string>) => string)=>{
    const valid=candidates.filter(c=>{try{params.validateParams({...base,...c},{engine:'vllm',info,gpuCount});return true;}catch{return false;}});
    const r=await search.stage(base,valid,'vllm',describe,run);
    if(r.best){base=r.settings;for(const c of valid)for(const k of Object.keys(c))tuned.add(k);}
  };
  await step([{}],()=>'Medição inicial (vLLM)');
  if(!search.results.some(r=>Number.isFinite(r.score))&&!search.stopped)
    throw Error(`A configuração atual não subiu no vLLM: ${search.results.map(r=>r.error).filter(Boolean).join('; ')}`);
  await step(uniq([String(base.gpuMemoryUtilization||''),'0.85','0.95']).map(v=>({gpuMemoryUtilization:v})),c=>`Uso de memória da GPU: ${c.gpuMemoryUtilization||'0.9'}`);
  await step(uniq([String(base.kvCacheDtype||''),'fp8']).map(v=>({kvCacheDtype:v})),c=>`Cache KV: ${c.kvCacheDtype||'auto'}`);
  await step(uniq([String(base.maxNumBatchedTokens||''),'2048','8192']).map(v=>({maxNumBatchedTokens:v})),c=>`Tokens por lote: ${c.maxNumBatchedTokens||'auto'}`);
  await step(['','ngram',...(known.nextnLayers>0?['mtp']:[])].map(v=>({vllmSpec:v})),c=>`Especulativa: ${c.vllmSpec||'none'}`);
  const valid=search.results.filter(r=>Number.isFinite(r.score));
  if(!valid.length){if(search.stopped==='cancelled')throw Error('Teste cancelado.');throw Error(`Nenhuma configuração subiu no vLLM: ${search.results.map(r=>r.error).filter(Boolean).join('; ')}`);}
  const result={...settings};for(const key of tuned)result[key]=base[key]??'';
  return {settings:result,results:search.results,best:valid.reduce((a,b)=>b.score>a.score?b:a),priority,stopped:search.stopped||'done'};
}

module.exports={execute,listDevices,fitParams,benchArgs,parseBench,runBench,probeServer,measureLlamaServer,measureOpenAi,probeLlamaServer,freePort,scoreOf,PRIORITIES,tune,tuneVllm};
