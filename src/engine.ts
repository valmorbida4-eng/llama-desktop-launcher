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
  let body=''; for await (const chunk of stream as AsyncIterable<Buffer>) {body+=chunk;if(body.length>5e6) throw Error('Resposta de release grande demais.');}
  return JSON.parse(body);
}
function backendOptions(platform=process.platform,arch=process.arch) {
  const options={
    win32:{
      x64:[
        {id:'vulkan',label:'Vulkan (AMD, Intel ou NVIDIA)',asset:'win-vulkan-x64.zip'},
        {id:'cuda-12.4',label:'NVIDIA CUDA 12.4 (recomendado para RTX)',asset:'win-cuda-12.4-x64.zip',runtime:'cudart-llama-bin-win-cuda-12.4-x64.zip'},
        {id:'cuda-13.4',label:'NVIDIA CUDA 13.4 (driver recente)',asset:'win-cuda-13.4-x64.zip',runtime:'cudart-llama-bin-win-cuda-13.4-x64.zip'},
        {id:'rocm-10.0',label:'AMD ROCm 10.0',asset:'win-rocm-10.0-x64.zip'},
        {id:'sycl',label:'Intel SYCL',asset:'win-sycl-x64.zip'},
        {id:'cpu',label:'Somente CPU',asset:'win-cpu-x64.zip'}
      ],
      arm64:[
        {id:'cuda-13.4',label:'NVIDIA CUDA 13.4',asset:'win-cuda-13.4-arm64.zip',runtime:'cudart-llama-bin-win-cuda-13.4-arm64.zip'},
        {id:'cpu',label:'Somente CPU',asset:'win-cpu-arm64.zip'}
      ]
    },
    linux:{
      x64:[
        {id:'vulkan',label:'Vulkan',asset:'ubuntu-vulkan-x64.tar.gz'},
        {id:'cuda-12.8',label:'NVIDIA CUDA 12.8',asset:'ubuntu-cuda-12.8-x64.tar.gz',runtime:'cudart-llama-b11193-bin-ubuntu-cuda-12.8-x64.tar.gz'},
        {id:'cuda-13.4',label:'NVIDIA CUDA 13.4',asset:'ubuntu-cuda-13.4-x64.tar.gz',runtime:'cudart-llama-b11193-bin-ubuntu-cuda-13.4-x64.tar.gz'},
        {id:'rocm-10.0',label:'AMD ROCm 10.0',asset:'ubuntu-rocm-10.0-x64.tar.gz'},
        {id:'sycl-fp16',label:'Intel SYCL FP16',asset:'ubuntu-sycl-fp16-x64.tar.gz'},
        {id:'sycl-fp32',label:'Intel SYCL FP32',asset:'ubuntu-sycl-fp32-x64.tar.gz'},
        {id:'cpu',label:'Somente CPU',asset:'ubuntu-x64.tar.gz'}
      ],
      arm64:[
        {id:'vulkan',label:'Vulkan',asset:'ubuntu-vulkan-arm64.tar.gz'},
        {id:'cuda-13.4',label:'NVIDIA CUDA 13.4',asset:'ubuntu-cuda-13.4-arm64.tar.gz',runtime:'cudart-llama-b11193-bin-ubuntu-cuda-13.4-arm64.tar.gz'},
        {id:'cpu',label:'Somente CPU',asset:'ubuntu-arm64.tar.gz'}
      ]
    },
    darwin:{
      x64:[{id:'metal',label:'Apple Metal',asset:'macos-x64.tar.gz'}],
      arm64:[{id:'metal',label:'Apple Metal',asset:'macos-arm64.tar.gz'}]
    }
  };
  return options[platform]?.[arch]||[];
}
function assetsFor(release,backend,platform=process.platform,arch=process.arch) {
  const option=backendOptions(platform,arch).find(item=>item.id===backend);
  if(!option) throw Error(`Backend ${backend} não disponível para ${platform}/${arch}.`);
  const mainName=`llama-${release.tag_name}-bin-${option.asset}`;
  const main=release.assets.find(item=>item.name===mainName);
  const runtime=option.runtime&&release.assets.find(item=>item.name===option.runtime);
  if(!main || (option.runtime&&!runtime)) throw Error(`A versão ${release.tag_name} não contém todos os pacotes de ${option.label}. Escolha outro backend ou uma pasta existente.`);
  return {main,runtime,option};
}
function assetFor(release,platform=process.platform,arch=process.arch,backend) {
  return assetsFor(release,backend||backendOptions(platform,arch)[0]?.id,platform,arch).main;
}
async function download(asset,file,onProgress) {
  const stream=await request(asset.browser_download_url);
  const out=fs.createWriteStream(file,{flags:'wx'});
  const hash=crypto.createHash('sha256'); let bytes=0;
  try { for await(const chunk of stream as AsyncIterable<Buffer>) {bytes+=chunk.length;if(bytes>1.5e9) throw Error('Arquivo maior que o limite permitido.');hash.update(chunk);if(!out.write(chunk)) await new Promise<void>(resolve=>out.once('drain',resolve));onProgress?.(Math.round(bytes/(asset.size||bytes)*100));} }
  finally {out.end();await new Promise<void>(resolve=>out.once('close',resolve));}
  const digest=hash.digest('hex');
  if(asset.digest && asset.digest.startsWith('sha256:') && digest!==asset.digest.slice(7)) throw Error('Checksum SHA-256 do llama.cpp não confere.');
  return digest;
}
function run(file,args,cwd): Promise<void> {return new Promise<void>((resolve,reject)=>{const p=spawn(file,args,{cwd,windowsHide:true});let err='';p.stderr.on('data',d=>err+=d.toString().slice(0,1000));p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(Error(`${file} falhou (${c}): ${err.slice(-500)}`)));});}
async function findExecutable(root,name='llama-server') {
  const expected=name+(process.platform==='win32'?'.exe':''); const todo=[root];
  while(todo.length) {const dir=todo.pop();for(const e of await fsp.readdir(dir,{withFileTypes:true})) {const p=path.join(dir,e.name);if(e.isDirectory()) todo.push(p);else if(e.isFile()&&e.name===expected) return p;}}
  return null;
}
async function copyRuntimeLibraries(source,destination,platform) {
  const pending=[source]; let copied=0;
  while(pending.length) {
    const dir=pending.pop();
    for(const entry of await fsp.readdir(dir,{withFileTypes:true})) {
      const file=path.join(dir,entry.name);
      const stat=await fsp.stat(file);
      if(stat.isDirectory()) pending.push(file);
      else if(stat.isFile() && (platform==='win32'?/\.dll$/i:/\.so(\.\d+)*$/).test(entry.name)) {
        await fsp.copyFile(file,path.join(destination,entry.name)); copied++;
      }
    }
  }
  if(!copied) throw Error('O pacote CUDA não contém as bibliotecas esperadas.');
}
async function installEngine(destination,backend,onProgress) {
  if(typeof backend==='function'){onProgress=backend;backend=backendOptions()[0]?.id;}
  const release=await releaseInfo();
  const {main,runtime}=assetsFor(release,backend);
  const temp=await fsp.mkdtemp(path.join(os.tmpdir(),'llama-desktop-'));
  const archive=path.join(temp,main.name),unpack=path.join(temp,'unpack');
  const total=main.size+(runtime?.size||0);
  try {
    await fsp.mkdir(unpack);
    await download(main,archive,p=>onProgress?.(Math.round(p*main.size/total),'Baixando llama.cpp'));
    await run('tar',['-xf',archive,'-C',unpack],temp);
    const server=await findExecutable(unpack);
    if(!server) throw Error('Pacote baixado sem llama-server.');
    const candidate=path.dirname(server);
    if(runtime) {
      const runtimeArchive=path.join(temp,runtime.name),runtimeUnpack=path.join(temp,'runtime');
      await fsp.mkdir(runtimeUnpack);
      await download(runtime,runtimeArchive,p=>onProgress?.(Math.round((main.size+p*runtime.size/100)/total*100),'Baixando bibliotecas CUDA'));
      await run('tar',['-xf',runtimeArchive,'-C',runtimeUnpack],temp);
      await copyRuntimeLibraries(runtimeUnpack,candidate,process.platform);
    }
    await fsp.mkdir(path.dirname(destination),{recursive:true});
    if(fs.existsSync(destination)) throw Error('Já existe uma pasta de runtime nesse destino.');
    await fsp.rename(candidate,destination);
    onProgress?.(100,'Motor pronto');
    return {path:destination,release:release.tag_name,asset:main.name,backend};
  } finally {await fsp.rm(temp,{recursive:true,force:true}).catch(()=>{});}
}
module.exports={assetFor,assetsFor,backendOptions,installEngine,findExecutable};
