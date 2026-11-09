'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const apiModelId = 'modelo-local';
const defaults = Object.freeze({gpuLayers:'auto', context:4096, cacheK:'f16', cacheV:'f16', cpuMoe:'', flash:'auto', threads:'', batch:512, ubatch:256, device:''});
const params = require('./params');
// Valida os ajustes do perfil. engine e ctx (informações do modelo e do hardware) são opcionais: sem eles
// valida só o formato dos campos do llama.cpp.
function validateSettings(s: any, engine='llamacpp', ctx: any={}) {
  if (!s || typeof s !== 'object') throw Error('Ajustes ausentes.');
  return params.validateParams(s,{...ctx,engine});
}
function argsForModel(model: any, settings: any, mode: string, port=0, serverOptions: {host?: string; parallel?: number; keyPath?: string}={}) {
  validateSettings(settings);
  const a = ['-m',model.path,'-fit','on',...params.llamaArgs(settings,mode)];
  if (model.projector) a.push('--mmproj',model.projector);
  if (mode === 'server') {
    a.push('--alias',apiModelId);
    const host=serverOptions.host||'127.0.0.1';
    const parallel=Number(serverOptions.parallel||1);
    if(require('./network').scopeOf(host)===null||!Number.isInteger(parallel)||parallel<1||parallel>8)throw Error('Configuração de rede inválida.');
    a.push('--host',host,'--port',String(port),'--parallel',String(parallel));
    if(host!=='127.0.0.1') {if(!serverOptions.keyPath)throw Error('Chave de API obrigatória na rede.');a.push('--api-key-file',serverOptions.keyPath);}
  }
  return a;
}
// Sugestão inicial do llama.cpp. info = metadados do GGUF (model_info); sem eles, o nome do arquivo decide.
function recommend(model: any, hw: any, info: any=null) {
  const name=path.basename(model.path).toLowerCase();
  const large=model.size >= 6*1024**3;
  const known=info&&!info.error;
  const moe=known?info.expertCount>0:/(?:moe|a\d+b|e\d+b|expert)/i.test(name);
  const threads=Math.max(1,Math.min(hw.physicalCores || Math.ceil(hw.logicalCores/2) || 4,16));
  const memoryGiB=hw.memoryBytes/1024**3;
  let context=memoryGiB < 12 ? 2048 : large ? 4096 : 8192;
  if (known && info.contextLength) context=Math.min(context,info.contextLength);
  const result: Record<string, any>={...defaults,context,threads,ubatch:memoryGiB < 16 ? 128 : 256,batch:512};
  if (moe && large) result.cpuMoe=hw.gpuMemoryBytes && hw.gpuMemoryBytes < model.size ? 20 : '';
  if (name.includes('qwen3-coder-30b-a3b') || name.includes('qwen3-30b-a3b')) Object.assign(result,{context:4096,cpuMoe:hw.gpuMemoryBytes && hw.gpuMemoryBytes <= 10*1024**3 ? 34 : '',ubatch:256});
  if (memoryGiB >= 24) Object.assign(result,{cacheK:'q8_0',cacheV:'q8_0',flash:'on'});
  if (known && info.nextnLayers>0) Object.assign(result,{specType:'draft-mtp',draftMax:3});
  return result;
}
// Sugestão inicial do vLLM a partir do config.json e das GPUs (gpus = [{memoryBytes}] do nvidia-smi).
function recommendVllm(model: any, info: any, gpus: any[]=[]) {
  const known=info&&!info.error?info:{};
  const sizes=gpus.map(g=>(g.memoryBytes||0)/1024**3).filter(x=>x>0);
  const single=sizes.length?Math.min(...sizes):0;
  const weights=(model.size||0)/1024**3;
  let tp=1;
  if (sizes.length>=2 && weights>single*0.7) for (let n=2;n<=sizes.length;n*=2) if (!known.attentionHeads||known.attentionHeads%n===0) tp=n;
  const free=Math.max(0,single*tp*0.9-weights);
  const byMemory=free>=24?32768:free>=8?16384:free>=3?8192:4096;
  const context=known.contextLength?Math.min(known.contextLength,byMemory):byMemory;
  const result: Record<string, any>={context,gpuMemoryUtilization:'0.9',tensorParallel:tp>1?String(tp):''};
  if (tp>1 && known.expertCount>0) result.expertParallel='on';
  if (known.nextnLayers>0) Object.assign(result,{vllmSpec:'mtp',vllmSpecTokens:String(Math.max(1,known.nextnLayers))});
  return result;
}
function detectHardware() { return {platform:process.platform,arch:process.arch,memoryBytes:os.totalmem(),logicalCores:os.cpus().length,physicalCores:Math.max(1,Math.floor(os.cpus().length/2)),cpu:os.cpus()[0]?.model || ''}; }
function isWithin(parent: string,candidate: string) {
  const canonical=p=>{try{return fs.realpathSync.native(p);}catch{return path.resolve(p);}};
  const normalize=p=>process.platform==='win32'?canonical(p).toLowerCase():canonical(p);
  const base=normalize(parent),target=normalize(candidate);
  return target===base||target.startsWith(base.endsWith(path.sep)?base:base+path.sep);
}
// Nome legível de uma pasta do cache do Hugging Face (models--org--nome/snapshots/<hash>).
function hfDisplayName(dir: string) {
  const parts=path.resolve(dir).split(/[\\/]/);
  const at=parts.length-2;
  if(at>0&&parts[at]==='snapshots'&&/^models--/.test(parts[at-1])) return parts[at-1].slice('models--'.length).split('--').join('/');
  return path.basename(dir);
}
// Uma única varredura das pastas de modelos: arquivos GGUF (llama.cpp) e, com hf=true, pastas
// Hugging Face com config.json e .safetensors (vLLM). Links simbólicos para arquivos são seguidos
// (o cache do Hugging Face aponta os pesos para ../../blobs); links para pastas não, para evitar ciclos.
// Dentro de uma pasta HF já reconhecida, subpastas não viram outro modelo HF (ex.: text_encoder/).
function walkModels(roots: string[], {hf=false}: {hf?: boolean}={}) {
  const gguf=[],hfModels=[]; const seen=new Set(),seenHf=new Set();
  for (const root of (roots||[]).filter(Boolean)) {
    if (!fs.existsSync(root)) continue;
    const todo: {dir: string; insideHf: boolean}[]=[{dir:root,insideHf:false}];
    while(todo.length) {
      const {dir,insideHf}=todo.pop();
      let entries=[]; try { entries=fs.readdirSync(dir,{withFileTypes:true}); } catch { continue; }
      const files=[],dirs=[];
      for (const e of entries) {
        const file=path.join(dir,e.name);
        if (e.isDirectory()) { dirs.push(file); continue; }
        if (e.isFile()) { files.push({name:e.name,file}); continue; }
        if (e.isSymbolicLink()) { try { if (fs.statSync(file).isFile()) files.push({name:e.name,file}); } catch {} }
      }
      const sizeOf=f=>{try{return fs.statSync(f).size;}catch{return 0;}};
      const projectors=files.filter(f=>/^mmproj.*\.gguf$/i.test(f.name));
      for (const f of files) {
        const shard=/-([0-9]{5})-of-[0-9]{5}\.gguf$/i.exec(f.name);
        if (!/\.gguf$/i.test(f.name) || /^mmproj/i.test(f.name) || (shard && shard[1]!=='00001')) continue;
        const resolved=path.resolve(f.file); if (seen.has(resolved)) continue; seen.add(resolved);
        gguf.push({path:resolved,name:f.name,size:sizeOf(f.file),projector:projectors.length===1?projectors[0].file:null});
      }
      let isHf=false;
      if (hf && !insideHf) {
        const weights=files.filter(f=>/\.safetensors$/i.test(f.name));
        if (weights.length && files.some(f=>f.name==='config.json')) {
          isHf=true;
          const resolved=path.resolve(dir);
          if (!seenHf.has(resolved)) {
            seenHf.add(resolved);
            hfModels.push({path:resolved,name:`${hfDisplayName(resolved)} · vLLM`,size:weights.reduce((total,w)=>total+sizeOf(w.file),0),projector:null,engine:'vllm',
              symlinkedWeights:weights.some(w=>{try{return fs.lstatSync(w.file).isSymbolicLink();}catch{return false;}})});
          }
        }
      }
      for (const d of dirs) todo.push({dir:d,insideHf:insideHf||isHf});
    }
  }
  return {gguf:gguf.sort((a,b)=>a.name.localeCompare(b.name)),hf:hfModels.sort((a,b)=>a.name.localeCompare(b.name))};
}
function scanModels(roots: string[]) { return walkModels(roots).gguf; }
module.exports={apiModelId,defaults,validateSettings,argsForModel,recommend,recommendVllm,detectHardware,isWithin,scanModels,walkModels,hfDisplayName};
