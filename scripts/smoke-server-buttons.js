'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events');
const {app,BrowserWindow,shell}=require('electron');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'llama-server-buttons-'));
app.setPath('userData',temporary);
const modelDir=path.join(temporary,'models'),engineDir=path.join(temporary,'engine');
fs.mkdirSync(modelDir);fs.mkdirSync(engineDir);
const modelPath=path.join(modelDir,'sample.gguf');fs.writeFileSync(modelPath,Buffer.alloc(1024));
const executable=path.join(engineDir,process.platform==='win32'?'llama-server.exe':'llama-server');fs.writeFileSync(executable,'');
fs.writeFileSync(path.join(temporary,'settings.json'),JSON.stringify({modelDirs:[modelDir,''],engineDir,profiles:{},selectedModelPath:modelPath,firstRun:false,accessHost:'127.0.0.1',parallel:1}));
let starts=0,opens=0;
shell.openExternal=async()=>{opens++;};
const processes=require('node:child_process'),realSpawn=processes.spawn;
processes.spawn=(file,...args)=>{
 if(file!==executable)return realSpawn(file,...args);
 starts++;const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.exitCode=null;
 child.kill=()=>{child.exitCode=0;child.emit('exit',0);};return child;
};
const http=require('node:http'),realGet=http.get;
http.get=(options,callback)=>{
 if(options.path!=='/health')return realGet(options,callback);
 const request=new EventEmitter();setImmediate(()=>callback({statusCode:200,resume(){}}));return request;
};
require('../build/app/main');
async function main(){
 await app.whenReady();const win=BrowserWindow.getAllWindows()[0];
 if(win.webContents.isLoading())await new Promise(r=>win.webContents.once('did-finish-load',r));
 await win.webContents.executeJavaScript(`(async()=>{
  for(let i=0;i<100&&document.getElementById('start-server').disabled;i++)await new Promise(r=>setTimeout(r,100));
  document.getElementById('start-server').click();
  for(let i=0;i<100&&(await window.llama.state()).active===null;i++)await new Promise(r=>setTimeout(r,100));
  await new Promise(r=>setTimeout(r,300));
 })()`);
 assert.equal(starts,1);assert.equal(opens,0);
 const state=await win.webContents.executeJavaScript(`({endpoint:document.getElementById('endpoint').textContent,hidden:document.getElementById('connection').hidden,startDisabled:document.getElementById('start-server').disabled,browserDisabled:document.getElementById('launch').disabled})`);
 assert.match(state.endpoint,/\/v1/);assert.equal(state.hidden,false);assert.equal(state.startDisabled,true);assert.equal(state.browserDisabled,false);
 if(process.env.LLAMA_TEST_SCREENSHOT)fs.writeFileSync(process.env.LLAMA_TEST_SCREENSHOT,(await win.webContents.capturePage()).toPNG());
 await win.webContents.executeJavaScript(`document.getElementById('launch').click()`);
 for(let i=0;i<50&&opens===0;i++)await new Promise(r=>setTimeout(r,100));
 assert.equal(opens,1);assert.equal(starts,1);
 await win.webContents.executeJavaScript(`document.getElementById('stop').click()`);
 await new Promise(r=>setTimeout(r,300));
 assert.equal(await win.webContents.executeJavaScript(`document.getElementById('start-server').disabled`),false);
 console.log('OK: início sem navegador, endpoint visível, navegador reutiliza servidor e botão reativado após parar.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{app.quit();setTimeout(()=>fs.rmSync(temporary,{recursive:true,force:true}),1000).unref();});
