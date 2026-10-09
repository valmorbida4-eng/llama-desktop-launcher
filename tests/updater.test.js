'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),os=require('node:os');
const https=require('node:https'),crypto=require('node:crypto');
const {Readable}=require('node:stream'),{EventEmitter}=require('node:events');
const updater=require('../build/app/updater');
const download=`https://github.com/${updater.REPOSITORY}/releases/download/v0.9.0/`;
async function workspace(t){const root=await fsp.mkdtemp(path.join(os.tmpdir(),'llama-update-test-'));t.after(()=>fsp.rm(root,{recursive:true,force:true}));return root;}
function serve(t,routes){t.mock.method(https,'get',(url,_options,callback)=>{const req=new EventEmitter();process.nextTick(()=>{const body=routes[url];const response=Readable.from([body===undefined?Buffer.alloc(0):Buffer.from(body)]);response.statusCode=body===undefined?404:200;callback(response);});return req;});}
function release(assets,tag='v0.9.0'){return {tag_name:tag,draft:false,prerelease:false,body:'Notas',published_at:'2026-10-09T00:00:00Z',assets:assets.map(([name,data])=>({name,size:Buffer.byteLength(data),browser_download_url:download+name,digest:'sha256:'+crypto.createHash('sha256').update(data).digest('hex')}))};}
const latestUrl=`https://api.github.com/repos/${updater.REPOSITORY}/releases/latest`;

test('compara versões SemVer numericamente e ignora tags inválidas',()=>{
  assert.equal(updater.isNewer('v0.10.0','0.9.9'),true);
  assert.equal(updater.isNewer('0.4.3','0.4.3'),false);
  assert.equal(updater.isNewer('0.4.2','0.4.3'),false);
  assert.equal(updater.isNewer('v1.0.0-rc.1','0.4.3'),false);
  assert.equal(updater.isNewer('b11514','0.4.3'),false);
});

test('escolhe o pacote publicado de cada sistema, arquitetura e formato Linux',()=>{
  assert.equal(updater.packageName('0.5.0','win32','x64'),'Llama.Desktop.Launcher.Setup.0.5.0.exe');
  assert.equal(updater.packageName('0.5.0','darwin','arm64'),'Llama.Desktop.Launcher-0.5.0-arm64.dmg');
  assert.equal(updater.packageName('0.5.0','darwin','x64'),'Llama.Desktop.Launcher-0.5.0.dmg');
  assert.equal(updater.packageName('0.5.0','linux','x64','deb'),'llama-desktop-launcher_0.5.0_amd64.deb');
  assert.equal(updater.packageName('0.5.0','linux','arm64','rpm'),'llama-desktop-launcher-0.5.0.aarch64.rpm');
  assert.equal(updater.packageName('0.5.0','linux','arm64','appimage'),'Llama.Desktop.Launcher-0.5.0-arm64.AppImage');
  assert.equal(updater.packageName('0.5.0','win32','arm64'),null);
  assert.equal(updater.linuxFormat({APPIMAGE:'/home/a/app.AppImage'},()=>true),'appimage');
  assert.equal(updater.linuxFormat({},file=>file==='/var/lib/dpkg/info/llama-desktop-launcher.list'),'deb');
  assert.equal(updater.linuxFormat({},file=>file==='/usr/bin/rpm'),'rpm');
});

test('verificação informa versão nova com pacote e checksums da release',async t=>{
  const name='Llama.Desktop.Launcher.Setup.0.9.0.exe';
  serve(t,{[latestUrl]:JSON.stringify(release([[name,'exe'],['SHA256SUMS.txt','sums']]))});
  const info=await updater.checkForUpdate('0.4.3',{platform:'win32',arch:'x64'});
  assert.equal(info.available,true);assert.equal(info.version,'0.9.0');
  assert.equal(info.asset.name,name);assert.equal(info.checksums,download+'SHA256SUMS.txt');
  assert.equal(info.url,`https://github.com/${updater.REPOSITORY}/releases/tag/v0.9.0`);
  const current=await updater.checkForUpdate('0.9.0',{platform:'win32',arch:'x64'});
  assert.equal(current.available,false);assert.equal(current.asset,null);
});

test('recusa release com URL de download fora do repositório',async t=>{
  const data=release([['Llama.Desktop.Launcher.Setup.0.9.0.exe','exe'],['SHA256SUMS.txt','sums']]);
  data.assets[0].browser_download_url='https://example.com/Llama.Desktop.Launcher.Setup.0.9.0.exe';
  serve(t,{[latestUrl]:JSON.stringify(data)});
  await assert.rejects(updater.checkForUpdate('0.4.3',{platform:'win32',arch:'x64'}),/inesperado/);
});

test('download só é aceito quando confere com SHA256SUMS.txt',async t=>{
  const root=await workspace(t),name='Llama.Desktop.Launcher.Setup.0.9.0.exe',data='instalador';
  const good=crypto.createHash('sha256').update(data).digest('hex');
  const info={asset:release([[name,data]]).assets[0],checksums:download+'SHA256SUMS.txt'};
  serve(t,{[download+name]:data,[download+'SHA256SUMS.txt']:`${good}  ${name}\n`});
  const file=await updater.downloadUpdate(info,path.join(root,'updates'));
  assert.equal(await fsp.readFile(file,'utf8'),data);
  t.mock.restoreAll();
  serve(t,{[download+name]:data,[download+'SHA256SUMS.txt']:`${'0'.repeat(64)}  ${name}\n`});
  await assert.rejects(updater.downloadUpdate(info,path.join(root,'bad')),/SHA256SUMS/);
  assert.equal(fs.existsSync(path.join(root,'bad')),false);
  t.mock.restoreAll();
  serve(t,{[download+'SHA256SUMS.txt']:`${good}  outro.exe\n`});
  await assert.rejects(updater.downloadUpdate(info,path.join(root,'missing')),/não lista/);
});
