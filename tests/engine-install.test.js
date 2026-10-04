'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),os=require('node:os');
const https=require('node:https'),crypto=require('node:crypto');
const {Readable}=require('node:stream'),{EventEmitter}=require('node:events');
const {execFileSync}=require('node:child_process');
const engine=require('../build/app/engine');
async function workspace(t){const root=await fsp.mkdtemp(path.join(os.tmpdir(),'llama-engine-test-'));t.after(async()=>{assert.ok(root.startsWith(path.join(os.tmpdir(),'llama-engine-test-')));await fsp.rm(root,{recursive:true,force:true});});return root;}
test('download respeita backpressure sem acumular listeners e valida checksum',async t=>{
 const root=await workspace(t),chunk=Buffer.alloc(65536,17),data=Buffer.concat(Array(64).fill(chunk));
 const warnings=[];const onWarning=w=>warnings.push(w);process.on('warning',onWarning);t.after(()=>process.off('warning',onWarning));
 const digest=crypto.createHash('sha256').update(data).digest('hex');let progress=0;
 const result=await engine.saveDownload(Readable.from(Array(64).fill(chunk)),{size:data.length,digest:'sha256:'+digest},path.join(root,'download'),p=>progress=p);
 assert.equal(result,digest);assert.equal(progress,100);assert.deepEqual(await fsp.readFile(path.join(root,'download')),data);
 await new Promise(r=>setImmediate(r));assert.equal(warnings.filter(w=>w.name==='MaxListenersExceededWarning').length,0);
 await assert.rejects(engine.saveDownload(Readable.from([chunk]),{digest:'sha256:'+'0'.repeat(64)},path.join(root,'bad')),/Checksum/);
 await assert.rejects(engine.saveDownload(Readable.from([chunk]),{},root),/EISDIR|EEXIST|EPERM/);
});
test('instala motor ao lado do destino sem mover entre sistemas de arquivos',async t=>{
 const root=await workspace(t),payload=path.join(root,'payload'),parent=path.join(root,'user-data','engines'),destination=path.join(parent,'123');
 await fsp.mkdir(payload);const executable='llama-server'+(process.platform==='win32'?'.exe':'');
 await fsp.writeFile(path.join(payload,executable),'engine',{mode:0o755});await fsp.writeFile(path.join(payload,'runtime.so'),'library');
 if(process.platform!=='win32')await fsp.symlink('runtime.so',path.join(payload,'runtime.so.1'));
 const archive=path.join(root,'fixture.tar.gz');execFileSync('tar',['-czf',archive,'-C',payload,'.']);const data=await fsp.readFile(archive);
 const assetName='llama-b11193-bin-'+engine.backendOptions().find(x=>x.id==='cpu'||x.id==='metal').asset;
 const release={tag_name:'b11193',assets:[{name:assetName,size:data.length,browser_download_url:'https://fixture.test/engine',digest:'sha256:'+crypto.createHash('sha256').update(data).digest('hex')}]};
 t.mock.method(https,'get',(url,_options,callback)=>{const req=new EventEmitter();process.nextTick(()=>{const response=Readable.from([new URL(url).hostname==='api.github.com'?Buffer.from(JSON.stringify(release)):data]);response.statusCode=200;callback(response);});return req;});
 const originalRename=fsp.rename.bind(fsp);t.mock.method(fsp,'rename',async(source,target)=>{
  // Reproduce a /tmp -> /home EXDEV boundary without privileged mounts.
  if(!source.startsWith(parent+path.sep))throw Object.assign(Error('cross-device'),{code:'EXDEV'});
  assert.equal(target,destination);return originalRename(source,target);
 });
 const backend=engine.backendOptions().find(x=>x.id==='cpu'||x.id==='metal').id;
 const result=await engine.installEngine(destination,backend);assert.equal(result.path,destination);
 assert.equal(await fsp.readFile(path.join(destination,executable),'utf8'),'engine');assert.deepEqual(await fsp.readdir(parent),['123']);
 if(process.platform!=='win32'){assert.ok((await fsp.stat(path.join(destination,executable))).mode&0o111);assert.equal(await fsp.readlink(path.join(destination,'runtime.so.1')),'runtime.so');}
 // Failure leaves the previous engine intact and removes the temporary staging directory.
 release.assets[0].digest='sha256:'+'0'.repeat(64);
 await assert.rejects(engine.installEngine(path.join(parent,'failed'),backend),/Checksum/);
 assert.deepEqual(await fsp.readdir(parent),['123']);
});
