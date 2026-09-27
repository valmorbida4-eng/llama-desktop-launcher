'use strict';
const fs=require('node:fs');
const fsp=fs.promises;
const path=require('node:path');
const os=require('node:os');
const https=require('node:https');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');

function request(url, redirects=0) {
  if (redirects>5 || !url.startsWith('https://')) return Promise.reject(Error('Redirecionamento inválido.'));
  return new Promise((resolve,reject)=>https.get(url,{headers:{'User-Agent':'Llama-Desktop-Launcher','Accept':'application/vnd.github+json'}},r=>{
    if ([301,302,303,307,308].includes(r.statusCode)) {r.resume();return resolve(request(new URL(r.headers.location,url).href,redirects+1));}
    if(r.statusCode!==200){r.resume();return reject(Error(`Download HTTP ${r.statusCode}`));}
    resolve(r);
  }).on('error',reject));
}
async function releaseInfo() {
  const stream=await request('https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/b11193');
  let body=''; for await (const chunk of stream) {body+=chunk;if(body.length>5e6) throw Error('Resposta de release grande demais.');}
  return JSON.parse(body);
}
function assetFor(release,platform=process.platform,arch=process.arch) {
  const names={win32:`win-vulkan-${arch}\\.zip$`,linux:`ubuntu-vulkan-${arch}\\.tar\\.gz$`,darwin:`macos-${arch}\\.tar\\.gz$`};
  const pattern=names[platform]; if(!pattern) throw Error('Sistema não suportado.');
  const asset=release.assets.find(a=>new RegExp(pattern,'i').test(a.name));
  if(!asset) throw Error(`A versão ${release.tag_name} não tem pacote para ${platform}/${arch}. Escolha uma pasta do llama.cpp manualmente.`);
  return asset;
}
async function download(asset,file,onProgress) {
  const stream=await request(asset.browser_download_url);
  const out=fs.createWriteStream(file,{flags:'wx'});
  const hash=crypto.createHash('sha256'); let bytes=0;
  try { for await(const chunk of stream) {bytes+=chunk.length;if(bytes>1.5e9) throw Error('Arquivo maior que o limite permitido.');hash.update(chunk);if(!out.write(chunk)) await new Promise(resolve=>out.once('drain',resolve));onProgress?.(Math.round(bytes/(asset.size||bytes)*100));} }
  finally {out.end();await new Promise(resolve=>out.once('close',resolve));}
  const digest=hash.digest('hex');
  if(asset.digest && asset.digest.startsWith('sha256:') && digest!==asset.digest.slice(7)) throw Error('Checksum SHA-256 do llama.cpp não confere.');
  return digest;
}
function run(file,args,cwd) {return new Promise((resolve,reject)=>{const p=spawn(file,args,{cwd,windowsHide:true});let err='';p.stderr.on('data',d=>err+=d.toString().slice(0,1000));p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(Error(`${file} falhou (${c}): ${err.slice(-500)}`)));});}
async function findExecutable(root,name='llama-server') {
  const expected=name+(process.platform==='win32'?'.exe':''); const todo=[root];
  while(todo.length) {const dir=todo.pop();for(const e of await fsp.readdir(dir,{withFileTypes:true})) {const p=path.join(dir,e.name);if(e.isDirectory()) todo.push(p);else if(e.isFile()&&e.name===expected) return p;}}
  return null;
}
async function installEngine(destination,onProgress) {
  const release=await releaseInfo(),asset=assetFor(release);
  const temp=await fsp.mkdtemp(path.join(os.tmpdir(),'llama-desktop-'));
  const archive=path.join(temp,asset.name),unpack=path.join(temp,'unpack');
  try {
    await fsp.mkdir(unpack); await download(asset,archive,onProgress);
    await run('tar',['-xf',archive,'-C',unpack],temp);
    const server=await findExecutable(unpack);
    if(!server) throw Error('Pacote baixado sem llama-server.');
    const candidate=path.dirname(server);
    await fsp.mkdir(path.dirname(destination),{recursive:true});
    if(fs.existsSync(destination)) throw Error('Já existe uma pasta de runtime nesse destino.');
    await fsp.rename(candidate,destination);
    return {path:destination,release:release.tag_name,asset:asset.name};
  } finally {await fsp.rm(temp,{recursive:true,force:true}).catch(()=>{});}
}
module.exports={assetFor,installEngine,findExecutable};
