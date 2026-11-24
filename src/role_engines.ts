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
function describe(dir: string,{main='',mainRelease='',platform=process.platform}: any={}) {
  const manifest=readManifest(dir),backends=detectBackends(dir,platform);
  const release=String(manifest?.release||(samePath(dir,main)?mainRelease:'')||'');
  const kind=backends.length?backends.join(' + '):'CPU';
  const when=installedAt(dir);
  const date=when?when.slice(0,10):'';
  const label=[kind,release,date&&`instalado em ${date}`].filter(Boolean).join(' · ');
  return {dir,backends,release,installedAt:when,label};
}
function samePath(a: string,b: string) {
  if(!a||!b)return false;
  const norm=(p: string)=>{const r=path.resolve(p);return process.platform==='win32'?r.toLowerCase():r;};
  return norm(a)===norm(b);
}
// Motores instalados (os mais novos primeiro) e o do principal, mesmo fora de <userData>/engines.
function listInstalled(root: string,main: string,{mainRelease='',platform=process.platform}: any={}) {
  const dirs: string[]=[];
  try{for(const entry of fs.readdirSync(root,{withFileTypes:true}))if((entry.isDirectory()||entry.isSymbolicLink())&&!entry.name.startsWith('.'))dirs.push(path.join(root,entry.name));}catch{}
  if(main&&!dirs.some(d=>samePath(d,main)))dirs.push(main);
  return dirs.filter(d=>hasServer(d,platform)).map(d=>({...describe(d,{main,mainRelease,platform}),main:samePath(d,main)}))
    .sort((a,b)=>Number(b.main)-Number(a.main)||String(b.installedAt).localeCompare(String(a.installedAt)));
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

module.exports={ROLES,MANIFEST,detectBackends,readManifest,writeManifest,describe,listInstalled,resolve,normalizeRoles,validateChoice,samePath,hasServer};
