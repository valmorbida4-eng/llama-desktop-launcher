'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const apiModelId = 'modelo-local';
const defaults = Object.freeze({gpuLayers:'auto', context:4096, cacheK:'f16', cacheV:'f16', cpuMoe:'', flash:'auto', threads:'', batch:512, ubatch:256, device:''});
const caches = new Set(['f32','f16','bf16','q8_0','q4_0','q4_1','q5_0','q5_1','iq4_nl']);
function validInt(value: unknown, allowEmpty=false, zero=false) {
  if (allowEmpty && value === '') return true;
  return Number.isSafeInteger(Number(value)) && String(value).trim() !== '' && Number(value) >= (zero ? 0 : 1);
}
function validateSettings(s: any) {
  if (!s || typeof s !== 'object') throw Error('Ajustes ausentes.');
  if (!['auto','all'].includes(String(s.gpuLayers)) && !validInt(s.gpuLayers,false,true)) throw Error('Camadas GPU inválidas.');
  if (!validInt(s.context)) throw Error('Contexto inválido.');
  if (!caches.has(s.cacheK) || !caches.has(s.cacheV)) throw Error('Formato de cache inválido.');
  if (!validInt(s.cpuMoe,true,true)) throw Error('Camadas MoE inválidas.');
  if (!['auto','on','off'].includes(s.flash)) throw Error('Flash Attention inválido.');
  for (const k of ['threads','batch','ubatch']) if (!validInt(s[k],true)) throw Error(`${k} inválido.`);
  if (s.device && !/^[A-Za-z][A-Za-z0-9:_-]{0,63}$/.test(s.device)) throw Error('Dispositivo inválido.');
  if (s.batch !== '' && s.ubatch !== '' && Number(s.ubatch) > Number(s.batch)) throw Error('Microbatch não pode exceder batch.');
  return true;
}
function argsForModel(model: any, settings: any, mode: string, port=0, serverOptions: {host?: string; parallel?: number; keyPath?: string}={}) {
  validateSettings(settings);
  const a = ['-m',model.path,'-fit','on','-ngl',String(settings.gpuLayers),'-c',String(settings.context),'-ctk',settings.cacheK,'-ctv',settings.cacheV,'-fa',settings.flash];
  if (model.projector) a.push('--mmproj',model.projector);
  for (const [key,flag] of [['cpuMoe','-ncmoe'],['threads','-t'],['batch','-b'],['ubatch','-ub'],['device','-dev']]) if (String(settings[key]) !== '') a.push(flag,String(settings[key]));
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
function recommend(model: any, hw: any) {
  const name=path.basename(model.path).toLowerCase();
  const large=model.size >= 6*1024**3;
  const moe=/(?:moe|a\d+b|e\d+b|expert)/i.test(name);
  const threads=Math.max(1,Math.min(hw.physicalCores || Math.ceil(hw.logicalCores/2) || 4,16));
  const memoryGiB=hw.memoryBytes/1024**3;
  const context=memoryGiB < 12 ? 2048 : large ? 4096 : 8192;
  const result: Record<string, any>={...defaults,context,threads,ubatch:memoryGiB < 16 ? 128 : 256,batch:512};
  if (moe && large) result.cpuMoe=hw.gpuMemoryBytes && hw.gpuMemoryBytes < model.size ? 20 : '';
  if (name.includes('qwen3-coder-30b-a3b') || name.includes('qwen3-30b-a3b')) Object.assign(result,{context:4096,cpuMoe:hw.gpuMemoryBytes && hw.gpuMemoryBytes <= 10*1024**3 ? 34 : '',ubatch:256});
  if (memoryGiB >= 24) Object.assign(result,{cacheK:'q8_0',cacheV:'q8_0',flash:'on'});
  return result;
}
function detectHardware() { return {platform:process.platform,arch:process.arch,memoryBytes:os.totalmem(),logicalCores:os.cpus().length,physicalCores:Math.max(1,Math.floor(os.cpus().length/2)),cpu:os.cpus()[0]?.model || ''}; }
function isWithin(parent: string,candidate: string) {
  const canonical=p=>{try{return fs.realpathSync.native(p);}catch{return path.resolve(p);}};
  const normalize=p=>process.platform==='win32'?canonical(p).toLowerCase():canonical(p);
  const base=normalize(parent),target=normalize(candidate);
  return target===base||target.startsWith(base.endsWith(path.sep)?base:base+path.sep);
}
function scanModels(roots: string[]) {
  const found=[]; const seen=new Set();
  for (const root of roots.filter(Boolean)) {
    if (!fs.existsSync(root)) continue;
    const todo=[root];
    while(todo.length) {
      const dir=todo.pop();
      let entries=[]; try { entries=fs.readdirSync(dir,{withFileTypes:true}); } catch { continue; }
      const projectors=entries.filter(e=>e.isFile() && /^mmproj.*\.gguf$/i.test(e.name));
      for (const e of entries) {
        const file=path.join(dir,e.name);
        if (e.isDirectory()) { todo.push(file); continue; }
        const shard=/-([0-9]{5})-of-[0-9]{5}\.gguf$/i.exec(e.name);
        if (!e.isFile() || !/\.gguf$/i.test(e.name) || /^mmproj/i.test(e.name) || (shard && shard[1]!=='00001')) continue;
        const resolved=path.resolve(file); if (seen.has(resolved)) continue; seen.add(resolved);
        found.push({path:resolved,name:e.name,size:fs.statSync(file).size,projector:projectors.length===1?path.join(dir,projectors[0].name):null});
      }
    }
  }
  return found.sort((a,b)=>a.name.localeCompare(b.name));
}
module.exports={apiModelId,defaults,validateSettings,argsForModel,recommend,detectHardware,isWithin,scanModels};
