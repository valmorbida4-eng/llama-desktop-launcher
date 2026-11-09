'use strict';
// Esquema dos parâmetros de cada motor: quais existem, quando se aplicam ao modelo e ao hardware, como
// validar e como viram argumentos. Valor '' = automático (o launcher não passa a opção e o motor decide).
// Conferido em common/arg.cpp do llama.cpp b12211, vllm/engine/arg_utils.py do vLLM 0.32.0 e no
// serve/server.py do Strata e do PolyStrata. Ver docs/adr/model-parameters-per-engine.md.

const PROFILE_VERSION=2;
const CACHE_TYPES=['f16','q8_0','q4_0','q5_0','q4_1','q5_1','f32','bf16','iq4_nl'];
const QUANTIZED_CACHE=new Set(['q8_0','q4_0','q5_0','q4_1','q5_1','iq4_nl']);
const SPEC_TYPES=['none','ngram-mod','ngram-simple','ngram-map-k','draft-simple','draft-eagle3','draft-mtp'];
const DRAFT_SPEC=new Set(['draft-simple','draft-eagle3']);
const VLLM_KV_DTYPES=['auto','float16','bfloat16','fp8','fp8_e4m3','fp8_e5m2'];
const DEVICE_NAME=/^[A-Za-z][A-Za-z0-9:_-]{0,63}$/;

type Ctx = {
  engine: string; info?: any; settings?: Record<string, any>;
  devices?: {name: string; description?: string; totalMiB?: number; freeMiB?: number}[] | null;
  gpuCount?: number | null; parallel?: number; hw?: any; draftModels?: {path: string; name: string}[];
  distribution?: string; strataOptions?: string[];
};
type Field = {
  key: string; engine: string; group: string; label: string; flag: string; kind: 'int'|'float'|'select'|'toggle'|'text'|'model'|'info';
  min?: number; max?: number; step?: number; options?: string[] | ((c: Ctx) => string[]); pattern?: RegExp; hint?: string;
  modes?: string[]; legacyAuto?: string[]; when?: (c: Ctx) => string | null;
};

const knownInfo=(c: Ctx)=>c.info&&!c.info.error;
const hasGpu=(c: Ctx)=>c.devices==null?true:c.devices.length>0; // desconhecido: não esconder
const gpuCount=(c: Ctx)=>c.gpuCount??(c.devices?c.devices.length:null);
const multiGpu=(c: Ctx)=>{const n=gpuCount(c);return n===null?null:n>=2;};
const isMoe=(c: Ctx)=>knownInfo(c)?c.info.expertCount>0:null;
const val=(c: Ctx,key: string)=>String(c.settings?.[key]??'');
const noGpu='Nenhuma GPU encontrada: o modelo roda na CPU.';
const needMulti='Só com 2 ou mais GPUs.';
const strataHas=(flag: string)=>(c: Ctx)=>(c.strataOptions||[]).includes(flag)?null:`A versão instalada do ${c.distribution||'Strata'} não aceita ${flag}.`;

const FIELDS: Field[]=[
  // llama.cpp · GPU e memória
  {key:'gpuLayers',engine:'llamacpp',group:'GPU e memória',label:'Camadas na GPU',flag:'-ngl',kind:'text',pattern:/^(all|\d{1,4})$/,legacyAuto:['auto'],when:c=>hasGpu(c)?null:noGpu},
  {key:'context',engine:'llamacpp',group:'GPU e memória',label:'Contexto (tokens)',flag:'-c',kind:'int',min:1,max:4194304},
  {key:'fitCtx',engine:'llamacpp',group:'GPU e memória',label:'Contexto mínimo do ajuste automático',flag:'-fitc',kind:'int',min:1,max:4194304,
    when:c=>val(c,'context')===''?null:'Só vale com o contexto em automático.'},
  {key:'fitTarget',engine:'llamacpp',group:'GPU e memória',label:'Margem livre por GPU (MiB)',flag:'-fitt',kind:'int',min:0,max:1048576,when:c=>hasGpu(c)?null:noGpu},
  {key:'device',engine:'llamacpp',group:'GPU e memória',label:'Dispositivo',flag:'-dev',kind:'text',pattern:/^[A-Za-z][A-Za-z0-9:_-]{0,63}(,[A-Za-z][A-Za-z0-9:_-]{0,63}){0,7}$/,
    options:c=>[...(c.devices||[]).map(d=>d.name),'none'],hint:'Nome do --list-devices, como CUDA0 ou Vulkan0; vários separados por vírgula; none = só CPU.',when:c=>hasGpu(c)?null:noGpu},
  {key:'splitMode',engine:'llamacpp',group:'GPU e memória',label:'Divisão entre GPUs',flag:'-sm',kind:'select',options:['none','layer','row','tensor'],when:c=>multiGpu(c)===false?needMulti:null},
  {key:'tensorSplit',engine:'llamacpp',group:'GPU e memória',label:'Proporção por GPU',flag:'-ts',kind:'text',pattern:/^\d+(\.\d+)?(,\d+(\.\d+)?){1,7}$/,hint:'Ex.: 3,1',when:c=>multiGpu(c)===false?needMulti:null},
  {key:'noKvOffload',engine:'llamacpp',group:'GPU e memória',label:'Cache KV fora da GPU',flag:'-nkvo',kind:'toggle',when:c=>hasGpu(c)?null:noGpu},
  {key:'loadMode',engine:'llamacpp',group:'GPU e memória',label:'Modo de carga',flag:'-lm',kind:'select',options:['auto','none','mmap','mlock','mmap+mlock','dio']},
  // llama.cpp · MoE
  {key:'cpuMoe',engine:'llamacpp',group:'Especialistas MoE',label:'Camadas de especialistas na CPU',flag:'-ncmoe',kind:'int',min:0,max:4096,
    when:c=>isMoe(c)===false?'Modelo denso: não tem especialistas MoE.':null},
  {key:'moeCacheMib',engine:'llamacpp',group:'Especialistas MoE',label:'Cache de especialistas na GPU (MiB)',flag:'--moe-cache-mib',kind:'int',min:0,max:1048576,
    when:c=>isMoe(c)===false?'Modelo denso: não tem especialistas MoE.':!hasGpu(c)?noGpu:null},
  {key:'moeCacheCpuShare',engine:'llamacpp',group:'Especialistas MoE',label:'Fração das faltas do cache feita na CPU',flag:'--moe-cache-cpu-share',kind:'float',min:0,max:1,step:0.05,
    when:c=>isMoe(c)===false?'Modelo denso: não tem especialistas MoE.':!hasGpu(c)?noGpu:Number(val(c,'moeCacheMib'))>0?null:'Só com o cache de especialistas ligado (MiB > 0).'},
  // llama.cpp · modelo denso
  {key:'cpuFfn',engine:'llamacpp',group:'Modelo denso',label:'Camadas com FFN na CPU',flag:'-ncffn',kind:'int',min:0,max:4096,
    when:c=>isMoe(c)?'Modelo MoE: use as camadas de especialistas na CPU.':!hasGpu(c)?noGpu:null},
  // llama.cpp · CPU e lotes
  {key:'threads',engine:'llamacpp',group:'CPU e lotes',label:'Threads de geração',flag:'-t',kind:'int',min:1,max:1024},
  {key:'threadsBatch',engine:'llamacpp',group:'CPU e lotes',label:'Threads de prompt',flag:'-tb',kind:'int',min:1,max:1024},
  {key:'batch',engine:'llamacpp',group:'CPU e lotes',label:'Batch',flag:'-b',kind:'int',min:1,max:1048576},
  {key:'ubatch',engine:'llamacpp',group:'CPU e lotes',label:'Microbatch',flag:'-ub',kind:'int',min:1,max:1048576},
  // llama.cpp · cache KV e atenção
  {key:'cacheK',engine:'llamacpp',group:'Cache KV e atenção',label:'Cache K',flag:'-ctk',kind:'select',options:CACHE_TYPES},
  {key:'cacheV',engine:'llamacpp',group:'Cache KV e atenção',label:'Cache V',flag:'-ctv',kind:'select',options:CACHE_TYPES,hint:'Cache V quantizado exige Flash Attention.'},
  {key:'flash',engine:'llamacpp',group:'Cache KV e atenção',label:'Flash Attention',flag:'-fa',kind:'select',options:['on','off'],legacyAuto:['auto']},
  {key:'swaFull',engine:'llamacpp',group:'Cache KV e atenção',label:'Cache SWA completo',flag:'--swa-full',kind:'toggle',
    when:c=>knownInfo(c)&&!c.info.slidingWindow?'O modelo não usa atenção com janela deslizante (SWA).':null},
  {key:'ctxCheckpoints',engine:'llamacpp',group:'Cache KV e atenção',label:'Checkpoints de contexto por sessão',flag:'-ctxcp',kind:'int',min:0,max:1024,modes:['server','cli'],
    when:c=>knownInfo(c)&&!c.info.slidingWindow&&!c.info.recurrent?'Só é usado por modelos SWA, híbridos ou recorrentes.':null},
  {key:'cacheReuse',engine:'llamacpp',group:'Cache KV e atenção',label:'Reuso de cache por deslocamento (tokens)',flag:'--cache-reuse',kind:'int',min:0,max:1048576,modes:['server']},
  {key:'kvUnified',engine:'llamacpp',group:'Cache KV e atenção',label:'Cache KV unificado entre sessões',flag:'-kvu',kind:'toggle',modes:['server'],
    when:c=>(c.parallel||1)>=2?null:'Só faz diferença com 2 ou mais sessões simultâneas.'},
  // llama.cpp · especulativa
  {key:'specType',engine:'llamacpp',group:'Decodificação especulativa',label:'Tipo',flag:'--spec-type',kind:'select',modes:['server','cli'],
    options:c=>SPEC_TYPES.filter(t=>t!=='draft-mtp'||!knownInfo(c)||c.info.nextnLayers>0).filter(t=>!DRAFT_SPEC.has(t)||c.draftModels==null||c.draftModels.length>0),
    hint:'draft-mtp usa as camadas MTP do próprio modelo; draft-simple usa um modelo rascunho menor.'},
  {key:'draftModel',engine:'llamacpp',group:'Decodificação especulativa',label:'Modelo rascunho',flag:'-md',kind:'model',modes:['server','cli'],
    options:c=>(c.draftModels||[]).map(m=>m.path),when:c=>DRAFT_SPEC.has(val(c,'specType'))?null:'Só para os tipos draft-simple e draft-eagle3.'},
  {key:'draftMax',engine:'llamacpp',group:'Decodificação especulativa',label:'Tokens por rascunho',flag:'--spec-draft-n-max',kind:'int',min:1,max:64,modes:['server','cli'],
    when:c=>val(c,'specType').startsWith('draft-')?null:'Só para os tipos draft-* (os tipos n-gram usam o próprio limite).'},

  // vLLM
  {key:'context',engine:'vllm',group:'Memória',label:'Contexto (tokens)',flag:'--max-model-len',kind:'int',min:1,max:4194304},
  {key:'gpuMemoryUtilization',engine:'vllm',group:'Memória',label:'Uso de memória da GPU',flag:'--gpu-memory-utilization',kind:'float',min:0.05,max:0.99,step:0.01},
  {key:'kvCacheDtype',engine:'vllm',group:'Memória',label:'Tipo do cache KV',flag:'--kv-cache-dtype',kind:'select',options:VLLM_KV_DTYPES,hint:'fp8 depende da GPU.'},
  {key:'cpuOffloadGb',engine:'vllm',group:'Memória',label:'Pesos na RAM (GiB)',flag:'--cpu-offload-gb',kind:'float',min:0,max:4096,step:0.5},
  {key:'kvOffloadGb',engine:'vllm',group:'Memória',label:'Cache KV na RAM (GiB)',flag:'--kv-offloading-size',kind:'float',min:0,max:4096,step:0.5},
  {key:'maxNumBatchedTokens',engine:'vllm',group:'Lotes e execução',label:'Tokens por lote',flag:'--max-num-batched-tokens',kind:'int',min:1,max:1048576},
  {key:'prefixCaching',engine:'vllm',group:'Lotes e execução',label:'Cache de prefixo',flag:'--enable-prefix-caching',kind:'toggle'},
  {key:'enforceEager',engine:'vllm',group:'Lotes e execução',label:'Sem CUDA graphs (eager)',flag:'--enforce-eager',kind:'toggle'},
  {key:'dtype',engine:'vllm',group:'Lotes e execução',label:'Precisão',flag:'--dtype',kind:'select',options:['auto','float16','bfloat16','float32'],
    when:c=>knownInfo(c)&&c.info.quantization?`Modelo quantizado (${c.info.quantization}): a precisão vem do checkpoint.`:null},
  {key:'tensorParallel',engine:'vllm',group:'Várias GPUs',label:'GPUs (paralelismo de tensor)',flag:'--tensor-parallel-size',kind:'int',min:1,max:16,when:c=>multiGpu(c)===false?needMulti:null},
  {key:'expertParallel',engine:'vllm',group:'Várias GPUs',label:'Paralelismo de especialistas',flag:'--enable-expert-parallel',kind:'toggle',
    when:c=>isMoe(c)===false?'Modelo denso: não tem especialistas MoE.':multiGpu(c)===false?needMulti:Number(val(c,'tensorParallel'))>1?null:'Só com 2 ou mais GPUs em paralelismo de tensor.'},
  {key:'vllmSpec',engine:'vllm',group:'Decodificação especulativa',label:'Método',flag:'--speculative-config',kind:'select',
    options:c=>['none','ngram',...(!knownInfo(c)||c.info.nextnLayers>0?['mtp']:[])],hint:'mtp usa as camadas MTP do próprio modelo.'},
  {key:'vllmSpecTokens',engine:'vllm',group:'Decodificação especulativa',label:'Tokens especulativos',flag:'num_speculative_tokens',kind:'int',min:1,max:16,
    when:c=>['','none'].includes(val(c,'vllmSpec'))?'Escolha um método de decodificação especulativa.':null},

  // Strata / PolyStrata: só o que o server.py instalado aceita.
  {key:'strataGpu',engine:'strata',group:'Servidor',label:'GPU(s)',flag:'--gpu',kind:'text',pattern:/^\d{1,2}(,\d{1,2}){0,7}$/,hint:'Números do nvidia-smi; vários dividem as camadas.',when:strataHas('--gpu')},
  {key:'strataMaxQueue',engine:'strata',group:'Servidor',label:'Fila máxima de pedidos',flag:'--max-queue',kind:'int',min:0,max:100000,when:strataHas('--max-queue')},
  {key:'strataIdleUnload',engine:'strata',group:'Servidor',label:'Descarregar após ociosidade (s)',flag:'--idle-unload',kind:'float',min:1,max:604800,when:strataHas('--idle-unload')},
  {key:'strataMinFreeVram',engine:'strata',group:'Servidor',label:'VRAM livre mínima para carregar (MiB)',flag:'--min-free-vram-mib',kind:'int',min:0,max:1048576,when:strataHas('--min-free-vram-mib')}
];
function fieldsFor(engine: string) {return FIELDS.filter(f=>f.engine===engine);}
function optionsOf(field: Field,c: Ctx) {return typeof field.options==='function'?field.options(c):field.options||null;}
function isAuto(field: Field,value: unknown) {const text=String(value??'').trim();return text===''||(field.legacyAuto||[]).includes(text);}

// Perfis salvos antes da v0.9.0: mesmos valores (o comportamento não muda); '-ngl auto' e '-fa auto'
// passam a ser o estado automático, que tem o mesmo efeito.
function migrateProfile(profile: any) {
  if(!profile||typeof profile!=='object') return {version:PROFILE_VERSION};
  if(profile.version>=PROFILE_VERSION) return profile;
  const next: Record<string, any>={};
  for(const [key,value] of Object.entries(profile)) next[key]=value==null?'':String(value);
  if(next.gpuLayers==='auto') next.gpuLayers='';
  if(next.flash==='auto') next.flash='';
  next.version=PROFILE_VERSION;
  return next;
}

function validateField(field: Field,value: unknown,c: Ctx) {
  if(isAuto(field,value)) return;
  const text=String(value).trim(),label=`${field.label} (${field.flag})`;
  if(field.kind==='int'){const n=Number(text);if(!/^\d+$/.test(text)||!Number.isSafeInteger(n)||n<(field.min??0)||n>(field.max??Number.MAX_SAFE_INTEGER))throw Error(`${label}: valor inválido.`);return;}
  if(field.kind==='float'){const n=Number(text);if(!/^\d+(\.\d+)?$/.test(text)||!Number.isFinite(n)||n<(field.min??0)||n>(field.max??Infinity))throw Error(`${label}: valor inválido.`);return;}
  if(field.kind==='toggle'){if(!['on','off'].includes(text))throw Error(`${label}: use ligado ou desligado.`);return;}
  if(field.kind==='select'){const options=optionsOf(field,c)||[];if(!options.includes(text))throw Error(`${label}: opção não disponível para este modelo.`);return;}
  if(field.kind==='text'){if(field.pattern&&!field.pattern.test(text))throw Error(`${label}: valor inválido.`);return;}
  if(field.kind==='model'){if(c.draftModels&&!c.draftModels.some(m=>m.path===text))throw Error(`${label}: escolha um GGUF das pastas de modelos.`);if(!c.draftModels&&/[\0\r\n]/.test(text))throw Error(`${label}: valor inválido.`);return;}
}
// Valida os campos do motor. Sem informações do modelo (ctx.info ausente) valida só o formato; com elas,
// também recusa o que o modelo não suporta (ex.: draft-mtp sem camadas MTP).
function validateParams(settings: any,c: Ctx) {
  if(!settings||typeof settings!=='object') throw Error('Ajustes ausentes.');
  const ctx={...c,settings};
  // Motivos específicos antes da checagem genérica de cada campo.
  if(c.engine==='llamacpp'&&settings.specType==='draft-mtp'&&knownInfo(c)&&!c.info.nextnLayers) throw Error('Este modelo não tem camadas MTP (draft-mtp).');
  if(c.engine==='vllm'&&settings.vllmSpec==='mtp'&&knownInfo(c)&&!c.info.nextnLayers) throw Error('Este modelo não tem camadas MTP.');
  for(const field of fieldsFor(c.engine)) validateField(field,settings[field.key],ctx);
  if(c.engine==='llamacpp') {
    const batch=String(settings.batch??''),ubatch=String(settings.ubatch??'');
    if(Number(ubatch)>Number(batch||2048)&&ubatch!=='') throw Error('Microbatch não pode exceder batch.');
    if(QUANTIZED_CACHE.has(String(settings.cacheV||''))&&settings.flash==='off') throw Error('Cache V quantizado exige Flash Attention ligado ou automático.');
    if(DRAFT_SPEC.has(String(settings.specType||''))&&!settings.draftModel) throw Error('Escolha o modelo rascunho para a decodificação especulativa.');
    if(settings.specType==='draft-mtp'&&knownInfo(c)&&!c.info.nextnLayers) throw Error('Este modelo não tem camadas MTP (draft-mtp).');
  }
  if(c.engine==='vllm') {
    const tp=Number(settings.tensorParallel||1);
    if(tp>1&&knownInfo(c)&&c.info.attentionHeads&&c.info.attentionHeads%tp!==0) throw Error(`O número de GPUs (${tp}) precisa dividir as ${c.info.attentionHeads} cabeças de atenção do modelo.`);
    if(tp>1&&gpuCount(c)!=null&&tp>gpuCount(c)) throw Error(`Só há ${gpuCount(c)} GPU(s) para o paralelismo de tensor.`);
    if(settings.vllmSpec==='mtp'&&knownInfo(c)&&!c.info.nextnLayers) throw Error('Este modelo não tem camadas MTP.');
  }
  return true;
}

// Argumentos do llama.cpp. mode: 'server' | 'cli' | 'fit' (llama-fit-params aceita só as opções comuns).
function llamaArgs(settings: any,mode='server') {
  const a: string[]=[];
  for(const field of fieldsFor('llamacpp')) {
    const value=settings?.[field.key];
    if(isAuto(field,value)) continue;
    if(field.modes&&!field.modes.includes(mode)) continue;
    if(mode==='fit'&&['threads','threadsBatch','specType','draftModel','draftMax','loadMode'].includes(field.key)) continue;
    const text=String(value).trim();
    if(field.kind==='toggle') {
      if(field.key==='kvUnified') a.push(text==='on'?'-kvu':'-no-kvu');
      else if(text==='on') a.push(field.flag);
      continue;
    }
    if(field.key==='specType'&&text==='none') continue;
    a.push(field.flag,text);
  }
  return a;
}
function vllmArgs(settings: any) {
  const a: string[]=[];
  for(const field of fieldsFor('vllm')) {
    const value=settings?.[field.key];
    if(isAuto(field,value)||field.key==='vllmSpec'||field.key==='vllmSpecTokens'||field.key==='context') continue;
    const text=String(value).trim();
    if(field.key==='prefixCaching') {a.push(text==='on'?'--enable-prefix-caching':'--no-enable-prefix-caching');continue;}
    if(field.kind==='toggle') {if(text==='on')a.push(field.flag);continue;}
    a.push(field.flag,text);
  }
  const method=String(settings?.vllmSpec||'');
  if(method&&method!=='none') {
    const tokens=Number(settings.vllmSpecTokens)||(method==='mtp'?1:3);
    const config: Record<string, any>={method,num_speculative_tokens:tokens};
    if(method==='ngram') Object.assign(config,{prompt_lookup_max:4,prompt_lookup_min:2});
    a.push('--speculative-config',JSON.stringify(config));
  }
  return a;
}
function strataArgs(settings: any,options: string[]=[]) {
  const a: string[]=[];
  for(const field of fieldsFor('strata')) {
    const value=settings?.[field.key];
    if(isAuto(field,value)||!options.includes(field.flag)) continue;
    a.push(field.flag,String(value).trim());
  }
  return a;
}

// Valores automáticos que dá para conhecer sem rodar o motor. fit = saída do llama-fit-params já lida.
function autoValues(c: Ctx,fit: any=null) {
  const out: Record<string, {value: string; source: string}>={};
  const put=(key: string,value: unknown,source: string)=>{if(value!==null&&value!==undefined&&value!=='')out[key]={value:String(value),source};};
  const info=knownInfo(c)?c.info:{};
  const physical=c.hw?.physicalCores||null;
  if(c.engine==='llamacpp') {
    put('gpuLayers',fit?.ngl==='all'?'todas':fit?.ngl,'ajuste automático (fit)');
    if(fit?.ctx)put('context',fit.ctx,'ajuste automático (fit)');else put('context',info.contextLength,'contexto de treino do modelo');
    put('fitCtx',4096,'padrão do llama.cpp');put('fitTarget',1024,'padrão do llama.cpp');
    put('device',c.devices?.length?c.devices.map(d=>d.name).join(','):null,'todos os dispositivos');
    put('splitMode','layer','padrão do llama.cpp');put('tensorSplit',fit?.ts||'proporcional à memória livre',fit?.ts?'ajuste automático (fit)':'padrão do llama.cpp');
    put('noKvOffload','off','padrão do llama.cpp');put('loadMode','auto (mmap)','padrão do llama.cpp');
    if(info.expertCount>0)put('cpuMoe',fit?fit.cpuMoe??0:null,'ajuste automático (fit)');
    put('moeCacheMib',0,'desligado');put('moeCacheCpuShare','0','padrão do llama.cpp');put('cpuFfn',0,'padrão do llama.cpp');
    put('threads',physical,'núcleos físicos');put('threadsBatch',c.settings?.threads||physical,'igual às threads de geração');
    put('batch',2048,'padrão do llama.cpp');put('ubatch',512,'padrão do llama.cpp');
    put('cacheK','f16','padrão do llama.cpp');put('cacheV','f16','padrão do llama.cpp');put('flash','auto','o llama.cpp liga quando o backend suporta');
    put('swaFull','off','padrão do llama.cpp');put('ctxCheckpoints',32,'padrão do llama.cpp');put('cacheReuse',0,'desligado');
    put('kvUnified','off','o launcher fixa as sessões');put('specType','none','padrão do llama.cpp');put('draftMax',3,'padrão do llama.cpp');
  }
  if(c.engine==='vllm') {
    put('context',info.contextLength,'max_position_embeddings do modelo');put('gpuMemoryUtilization','0.9','padrão do vLLM');
    put('kvCacheDtype',info.dtype?`auto (${info.dtype})`:'auto','tipo do modelo');put('cpuOffloadGb',0,'padrão do vLLM');put('kvOffloadGb',0,'padrão do vLLM');
    put('maxNumBatchedTokens','o vLLM decide','padrão do vLLM');put('prefixCaching','on','padrão do vLLM');put('enforceEager','off','padrão do vLLM');
    put('dtype',info.dtype?`auto (${info.dtype})`:'auto','config.json');put('tensorParallel',1,'padrão do vLLM');put('expertParallel','off','padrão do vLLM');
    put('vllmSpec','none','desligado');put('vllmSpecTokens',val(c,'vllmSpec')==='mtp'?info.nextnLayers||1:3,'padrão do launcher');
  }
  if(c.engine==='strata') {
    put('strataGpu',info.gpu??'0','configuração do Strata');put('strataMaxQueue','sem limite','padrão do Strata');
    put('strataIdleUnload','nunca','padrão do Strata');put('strataMinFreeVram','sempre carrega','padrão do Strata');
  }
  return out;
}

// Esquema pronto para a interface: campos do motor, aplicáveis ou não (com o motivo), e valores automáticos.
function schemaFor(c: Ctx,fit: any=null) {
  const autos=autoValues(c,fit);
  const fields=fieldsFor(c.engine).map(field=>{
    const reason=field.when?field.when(c):null;
    return {key:field.key,group:field.group,label:field.label,flag:field.flag,kind:field.kind,min:field.min,max:field.max,step:field.step,
      options:optionsOf(field,c),hint:field.hint||null,applicable:!reason,reason,auto:autos[field.key]||null,
      serverOnly:!!field.modes&&!field.modes.includes('cli')};
  });
  return {engine:c.engine,version:PROFILE_VERSION,fields,info:c.info||null,readOnly:readOnlyInfo(c)};
}
function readOnlyInfo(c: Ctx) {
  const info=knownInfo(c)?c.info:null;const rows: {label: string; value: string}[]=[];
  if(!info) return rows;
  if(c.engine==='llamacpp') {
    rows.push({label:'Arquitetura',value:info.architecture||'—'});
    if(info.blockCount)rows.push({label:'Camadas',value:String(info.blockCount)});
    if(info.contextLength)rows.push({label:'Contexto de treino',value:String(info.contextLength)});
    rows.push({label:'Tipo',value:[info.expertCount>0?`MoE (${info.expertUsedCount}/${info.expertCount} especialistas)`:'denso',info.slidingWindow?`SWA ${info.slidingWindow}`:'',info.recurrent?'híbrido/recorrente':'',info.nextnLayers?`MTP ${info.nextnLayers}`:''].filter(Boolean).join(' · ')});
  }
  if(c.engine==='vllm') {
    rows.push({label:'Arquitetura',value:info.architecture||'—'});
    if(info.quantization)rows.push({label:'Quantização',value:info.quantization});
    if(info.contextLength)rows.push({label:'Contexto máximo',value:String(info.contextLength)});
    rows.push({label:'Tipo',value:[info.expertCount>0?`MoE (${info.expertCount} especialistas)`:'denso',info.nextnLayers?`MTP ${info.nextnLayers}`:''].filter(Boolean).join(' · ')});
  }
  if(c.engine==='strata') {
    if(info.modelName)rows.push({label:'Modelo',value:String(info.modelName)});
    if(info.gpu)rows.push({label:'GPU da configuração',value:info.gpu});
    if(info.parallel)rows.push({label:'Sessões da configuração',value:String(info.parallel)});
    if(info.args?.length)rows.push({label:'Argumentos do motor',value:info.args.join(' ')});
  }
  return rows;
}

// Saída do llama-fit-params: "-c 32768 -ngl 49 [-ts 3,1] [-ot "blk\.30\.ffn_(...)_exps=CPU,..."]".
function parseFitOutput(text: string,blockCount: number | null=null) {
  const line=String(text||'').split(/\r?\n/).map(l=>l.trim()).filter(l=>/^-c \d+ -ngl -?\d+/.test(l)).pop();
  if(!line) return null;
  // -ngl -1 = todas as camadas (o modelo inteiro coube na GPU).
  const ctx=Number(/-c (\d+)/.exec(line)[1]),nglValue=Number(/-ngl (-?\d+)/.exec(line)[1]),ngl=nglValue<0?'all':String(nglValue);
  const ts=/-ts ([\d,]+)/.exec(line)?.[1]||null;
  const ot=/-ot "([^"]*)"/.exec(line)?.[1]||'';
  let cpuMoe=0;
  if(ot) {
    const layers=new Set<number>();let all=false;
    for(const entry of ot.split(',')) {
      if(!/exps/.test(entry)||!/=CPU/i.test(entry)) continue;
      const one=/blk\\?\.(\d+)\\?\./.exec(entry);
      if(one)layers.add(Number(one[1]));else if(/blk\\?\.\\d\+/.test(entry))all=true;
    }
    cpuMoe=all?(blockCount||layers.size):layers.size;
  }
  return {ctx,ngl,ts,ot:ot||null,cpuMoe};
}
// Saída do "llama-server --list-devices": "  CUDA0: NVIDIA GeForce RTX 4070 (12281 MiB, 11000 MiB free)".
function parseDevices(text: string) {
  const devices=[];
  for(const line of String(text||'').split(/\r?\n/)) {
    const m=/^\s*([A-Za-z][A-Za-z0-9_-]*\d+):\s*(.*?)\s*\((\d+) MiB,\s*(\d+) MiB free\)\s*$/.exec(line);
    if(m&&DEVICE_NAME.test(m[1]))devices.push({name:m[1],description:m[2],totalMiB:Number(m[3]),freeMiB:Number(m[4])});
  }
  return devices;
}
// Valores em uso lidos do registro do motor depois que o servidor sobe.
function parseRuntimeLog(engine: string,text: string) {
  const out: Record<string, string>={};
  const last=(re: RegExp)=>{let m=null,x;const g=new RegExp(re.source,re.flags.includes('g')?re.flags:re.flags+'g');while((x=g.exec(text)))m=x;return m;};
  if(engine==='llamacpp') {
    const layers=last(/offloaded (\d+)\/(\d+) layers to GPU/);if(layers)out.gpuLayers=`${layers[1]}/${layers[2]}`;
    const ctx=last(/n_ctx\s*=\s*(\d+)/);if(ctx)out.context=ctx[1];
    const ub=last(/n_ubatch\s*=\s*(\d+)/);if(ub)out.ubatch=ub[1];
    const fa=last(/flash_attn\s*=\s*(\w+)/);if(fa)out.flash=fa[1];
  }
  if(engine==='vllm') {
    const kv=last(/GPU KV cache size:\s*([\d,]+) tokens/);if(kv)out.kvTokens=kv[1].replace(/,/g,'');
    const conc=last(/Maximum concurrency for ([\d,]+) tokens per request:\s*([\d.]+)x/);if(conc){out.context=conc[1].replace(/,/g,'');out.concurrency=conc[2];}
  }
  return out;
}
module.exports={parseRuntimeLog,PROFILE_VERSION,CACHE_TYPES,QUANTIZED_CACHE,SPEC_TYPES,VLLM_KV_DTYPES,FIELDS,fieldsFor,isAuto,migrateProfile,validateParams,llamaArgs,vllmArgs,strataArgs,
  autoValues,schemaFor,parseFitOutput,parseDevices};
