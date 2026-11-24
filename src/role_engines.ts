'use strict';
// Motor por papel: o revisor e o decisor podem usar outro llama.cpp já instalado (ex.: principal no CUDA,
// decisor no Vulkan da GPU integrada). Cada motor baixado fica na própria pasta em <userData>/engines.
const fs=require('node:fs');
const path=require('node:path');

const ROLES=Object.freeze(['reviewer','decider']);
const MANIFEST='launcher-engine.json';
// Bibliotecas de backend que o llama.cpp carrega da pasta do executável (GGML_BACKEND_DL).
const BACKEND_LIBRARY=/^(?:lib)?ggml-(cuda|vulkan|hip|sycl|musa|opencl|metal|cann)\.(?:dll|so|dylib)$/i;
const BACKEND_NAMES: Record<string,string>=Object.freeze({cuda:'CUDA',vulkan:'Vulkan',hip:'ROCm',sycl:'SYCL',musa:'MUSA',opencl:'OpenCL',metal:'Metal',cann:'CANN'});

const serverFile=(dir: string,platform=process.platform)=>path.join(dir,platform==='win32'?'llama-server.exe':'llama-server');
function hasServer(dir: string,platform=process.platform) {try{return !!dir&&fs.statSync(serverFile(dir,platform)).isFile();}catch{return false;}}

// Backends presentes na pasta. Sem nenhuma biblioteca de GPU: só CPU (o macOS traz o Metal embutido).
function detectBackends(dir: string,platform=process.platform) {
  let files: string[]=[];
  try{files=fs.readdirSync(dir);}catch{return [];}
  const found=new Set<string>();
  for(const file of files){const m=BACKEND_LIBRARY.exec(file);if(m)found.add(BACKEND_NAMES[m[1].toLowerCase()]);}
  if(!found.size&&platform==='darwin')found.add('Metal');
  return [...found];
}
function readManifest(dir: string) {
  try{const data=JSON.parse(fs.readFileSync(path.join(dir,MANIFEST),'utf8'));return data&&typeof data==='object'?data:null;}catch{return null;}
}
function writeManifest(dir: string,info: {release?: string; backend?: string}) {
  fs.writeFileSync(path.join(dir,MANIFEST),JSON.stringify({release:String(info.release||''),backend:String(info.backend||''),installedAt:new Date().toISOString()},null,2));
}
// Pastas de <userData>/engines têm o carimbo de tempo da instalação como nome.
function installedAt(dir: string) {
  const stamp=Number(path.basename(dir));
  if(Number.isFinite(stamp)&&stamp>1e12)return new Date(stamp).toISOString();
  try{return fs.statSync(dir).mtime.toISOString();}catch{return '';}
}
// Tipo do motor (vulkan, cuda, rocm, sycl, cpu, metal…): é o que liga um perfil de modelo ao motor e o que decide
// se um download novo substitui o antigo. Builds e versões de CUDA diferentes do mesmo tipo contam como o mesmo motor.
const FAMILIES=['cuda','rocm','sycl','vulkan','metal','opencl','musa','cann','cpu'];
const FAMILY_LABELS: Record<string,string>=Object.freeze({cuda:'CUDA',rocm:'ROCm',sycl:'SYCL',vulkan:'Vulkan',metal:'Metal',opencl:'OpenCL',musa:'MUSA',cann:'CANN',cpu:'CPU',vllm:'vLLM',strata:'Strata'});
function familyOf(backend: string) {
  const id=String(backend||'').trim().toLowerCase();
  if(!id||id==='external')return '';
  if(id==='hip')return 'rocm';
  return FAMILIES.find(family=>id===family||id.startsWith(family+'-'))||id;
}
function familyLabel(key: string) {return String(key||'').split('+').filter(Boolean).map(k=>FAMILY_LABELS[k]||k).join(' + ');}
// O manifesto do download vale primeiro; sem ele, as bibliotecas da pasta. Sem biblioteca de GPU: CPU.
function engineKey(dir: string,platform=process.platform) {
  if(!dir)return '';
  const fromManifest=familyOf(readManifest(dir)?.backend);
  if(fromManifest)return fromManifest;
  const found=detectBackends(dir,platform).map(name=>familyOf(name)).sort();
  return found.length?found.join('+'):'cpu';
}
function describe(dir: string,{main='',mainRelease='',platform=process.platform}: any={}) {
  const manifest=readManifest(dir),backends=detectBackends(dir,platform);
  const release=String(manifest?.release||(samePath(dir,main)?mainRelease:'')||'');
  const kind=backends.length?backends.join(' + '):'CPU';
  const when=installedAt(dir);
  const date=when?when.slice(0,10):'';
  const label=[kind,release,date&&`instalado em ${date}`].filter(Boolean).join(' · ');
  const key=engineKey(dir,platform);
  return {dir,backends,release,installedAt:when,label,key,keyLabel:familyLabel(key)};
}
function samePath(a: string,b: string) {
  if(!a||!b)return false;
  const norm=(p: string)=>{const r=path.resolve(p);return process.platform==='win32'?r.toLowerCase():r;};
  return norm(a)===norm(b);
}
// Motores instalados (os mais novos primeiro), o do principal e as pastas escolhidas pelo usuário (extra), que ficam
// fora de <userData>/engines e continuam na lista depois que o principal passa para outro motor.
function listInstalled(root: string,main: string,{mainRelease='',platform=process.platform,extra=[]}: any={}) {
  const dirs: string[]=[];
  try{for(const entry of fs.readdirSync(root,{withFileTypes:true}))if((entry.isDirectory()||entry.isSymbolicLink())&&!entry.name.startsWith('.'))dirs.push(path.join(root,entry.name));}catch{}
  for(const dir of [main,...(Array.isArray(extra)?extra:[])])if(typeof dir==='string'&&dir&&!dirs.some(d=>samePath(d,dir)))dirs.push(dir);
  return dirs.filter(d=>hasServer(d,platform)).map(d=>({...describe(d,{main,mainRelease,platform}),main:samePath(d,main)}))
    .sort((a,b)=>Number(b.main)-Number(a.main)||String(b.installedAt).localeCompare(String(a.installedAt)));
}
// Motores que um download novo substitui: os do mesmo tipo que o launcher baixou em <root>. Nunca a pasta
// escolhida pelo usuário fora dali, nem um link (junção), que apontaria para fora.
function replaceable(installed: {dir: string; key: string}[],fresh: string,root: string) {
  const real=(p: string)=>{try{return fs.realpathSync.native(p);}catch{return path.resolve(p);}};
  const base=real(root),key=engineKey(fresh);
  return installed.filter(item=>{
    if(!key||item.key!==key||samePath(item.dir,fresh))return false;
    try{if(!fs.lstatSync(item.dir).isDirectory())return false;}catch{return false;}
    const relative=path.relative(base,real(item.dir));
    return !!relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&!relative.includes(path.sep);
  }).map(item=>item.dir);
}
// Pasta que o papel usa: a escolhida, se ainda tiver o llama-server; senão a do principal.
function resolve(roleEngines: any,role: string,main: string,platform=process.platform) {
  const chosen=String(roleEngines?.[role]||'');
  return chosen&&!samePath(chosen,main)&&hasServer(chosen,platform)?chosen:main;
}
function normalizeRoles(value: any) {
  const out: Record<string,string>={};
  for(const role of ROLES)out[role]=typeof value?.[role]==='string'?value[role]:'';
  return out;
}
// '' = o mesmo motor do principal. Outro valor precisa ser um dos motores instalados.
function validateChoice(role: string,dir: any,installed: {dir: string}[]) {
  if(!ROLES.includes(role))throw Error('Papel inválido.');
  if(dir===''||dir==null)return '';
  if(typeof dir!=='string')throw Error('Motor inválido.');
  const found=installed.find(item=>samePath(item.dir,dir));
  if(!found)throw Error('Este motor não está mais instalado. Atualize a lista ou escolha outro.');
  return found.dir;
}

module.exports={ROLES,MANIFEST,familyOf,familyLabel,engineKey,replaceable,detectBackends,readManifest,writeManifest,describe,listInstalled,resolve,normalizeRoles,validateChoice,samePath,hasServer};
