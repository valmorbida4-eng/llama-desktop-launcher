'use strict';
const fs=require('node:fs');
const fsp=fs.promises;
const path=require('node:path');
const engine=require('./engine');

const REPOSITORY='valmorbida4-eng/llama-desktop-launcher';
const DOWNLOAD_PREFIX=`https://github.com/${REPOSITORY}/releases/download/`;
const CHECK_INTERVAL_MS=24*60*60*1000;

function parseVersion(value) {
  const match=/^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value||''));
  return match?match.slice(1).map(Number):null;
}
function isNewer(candidate,current) {
  const a=parseVersion(candidate),b=parseVersion(current);
  if(!a||!b) return false;
  for(let i=0;i<3;i++) if(a[i]!==b[i]) return a[i]>b[i];
  return false;
}
// The installed package type decides which Linux file replaces it.
function linuxFormat(env=process.env,exists=fs.existsSync) {
  if(env.APPIMAGE) return 'appimage';
  if(exists('/var/lib/dpkg/info/llama-desktop-launcher.list')) return 'deb';
  if(exists('/usr/bin/rpm')) return 'rpm';
  if(exists('/usr/bin/dpkg')) return 'deb';
  return 'appimage';
}
function packageName(version,platform=process.platform,arch=process.arch,format=platform==='linux'?linuxFormat():null) {
  const arm=arch==='arm64';
  if(platform==='win32'&&arch==='x64') return `Llama.Desktop.Launcher.Setup.${version}.exe`;
  if(platform==='darwin'&&(arm||arch==='x64')) return `Llama.Desktop.Launcher-${version}${arm?'-arm64':''}.dmg`;
  if(platform==='linux'&&(arm||arch==='x64')) {
    if(format==='deb') return `llama-desktop-launcher_${version}_${arm?'arm64':'amd64'}.deb`;
    if(format==='rpm') return `llama-desktop-launcher-${version}.${arm?'aarch64':'x86_64'}.rpm`;
    return `Llama.Desktop.Launcher-${version}${arm?'-arm64':''}.AppImage`;
  }
  return null;
}
function parseChecksums(text) {
  const sums=new Map();
  for(const line of String(text).split(/\r?\n/)) {
    const match=/^([0-9a-f]{64})\s+\*?(.+)$/i.exec(line.trim());
    if(match) sums.set(match[2],match[1].toLowerCase());
  }
  return sums;
}
async function readText(url,limit) {
  const stream=await engine.request(url);let body='';
  for await (const chunk of stream as AsyncIterable<Buffer>) {body+=chunk;if(body.length>limit) throw Error('Resposta grande demais.');}
  return body;
}
function releaseAsset(release,name) {
  const asset=release.assets?.find(item=>item.name===name);
  if(asset&&!String(asset.browser_download_url).startsWith(DOWNLOAD_PREFIX)) throw Error('Endereço de download inesperado na release.');
  return asset||null;
}
async function checkForUpdate(currentVersion,{platform=process.platform,arch=process.arch,format=undefined}={}) {
  const release=JSON.parse(await readText(`https://api.github.com/repos/${REPOSITORY}/releases/latest`,5e6));
  const version=parseVersion(release.tag_name)?.join('.');
  if(!version||release.draft||release.prerelease) throw Error('Release mais recente com versão inválida.');
  const info={currentVersion,version,available:isNewer(version,currentVersion),notes:String(release.body||'').slice(0,4000),
    url:`https://github.com/${REPOSITORY}/releases/tag/v${version}`,publishedAt:release.published_at||null,asset:null,checksums:null};
  if(!info.available) return info;
  const name=packageName(version,platform,arch,format??(platform==='linux'?linuxFormat():null));
  const asset=name&&releaseAsset(release,name),checksums=releaseAsset(release,'SHA256SUMS.txt');
  if(asset&&checksums) {
    info.asset={name:asset.name,size:asset.size,digest:asset.digest||null,browser_download_url:asset.browser_download_url};
    info.checksums=checksums.browser_download_url;
  }
  return info;
}
// Downloads the package and accepts it only when it matches SHA256SUMS.txt and the API digest.
async function downloadUpdate(info,directory,onProgress) {
  if(!info?.asset||!info.checksums) throw Error('Esta versão não tem pacote para este sistema.');
  if(!String(info.asset.browser_download_url).startsWith(DOWNLOAD_PREFIX)||!String(info.checksums).startsWith(DOWNLOAD_PREFIX)) throw Error('Endereço de download inesperado.');
  const expected=parseChecksums(await readText(info.checksums,64*1024)).get(info.asset.name);
  if(!expected) throw Error('SHA256SUMS.txt não lista o pacote desta plataforma.');
  await fsp.rm(directory,{recursive:true,force:true});
  await fsp.mkdir(directory,{recursive:true});
  const file=path.join(directory,path.basename(info.asset.name));
  try {
    const digest=await engine.saveDownload(await engine.request(info.asset.browser_download_url),info.asset,file,onProgress);
    if(digest!==expected) throw Error('Checksum SHA-256 do download não confere com SHA256SUMS.txt.');
  } catch(error) {await fsp.rm(directory,{recursive:true,force:true});throw error;}
  return file;
}
function installHint(file) {
  if(file.endsWith('.deb')) return `sudo apt install "${file}"`;
  if(file.endsWith('.rpm')) return `sudo dnf install "${file}"`;
  return null;
}

module.exports={REPOSITORY,CHECK_INTERVAL_MS,parseVersion,isNewer,linuxFormat,packageName,parseChecksums,checkForUpdate,downloadUpdate,installHint};
