'use strict';
// Opt-in Electron UI smoke test: node_modules/.bin/electron scripts/smoke-ui.js
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {app,BrowserWindow}=require('electron');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'llama-ui-smoke-'));
app.setPath('userData',temporary);
require('../src/main');

async function main(){
  await app.whenReady();
  let win=BrowserWindow.getAllWindows()[0];
  for(let i=0;!win&&i<30;i++){await new Promise(resolve=>setTimeout(resolve,100));win=BrowserWindow.getAllWindows()[0];}
  if(!win)throw Error('Janela principal não abriu.');
  if(win.webContents.isLoading())await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
  const result=await win.webContents.executeJavaScript(`(async()=>{
    for(let i=0;i<50&&!window.llama;i++)await new Promise(r=>setTimeout(r,100));
    const state=await window.llama.state();
    await new Promise(r=>setTimeout(r,250));
    const settingsVisible=!document.getElementById('settings-view').hidden;
    const importButton=!!document.getElementById('import-profiles');
    const chatButton=!!document.getElementById('start-chat');
    const firewallButton=!!document.getElementById('create-firewall');
    document.getElementById('nav-models').click();
    await new Promise(r=>setTimeout(r,250));
    const modelsVisible=!document.getElementById('home-view').hidden;
    const chatInsideModels=document.getElementById('home-view').contains(document.getElementById('start-chat'));
    document.getElementById('nav-settings').click();
    return {firstRun:state.config.firstRun,settingsVisible,importButton,chatButton,firewallButton,modelsVisible,chatInsideModels,settingsAfterReturn:!document.getElementById('settings-view').hidden};
  })()`);
  if(Object.values(result).some(value=>value!==true))throw Error(`Estado da interface inesperado: ${JSON.stringify(result)}`);
  process.stdout.write(`OK interface Electron: ${JSON.stringify(result)}\n`);
}
main().catch(error=>{process.stderr.write(`${error.stack||error.message}\n`);process.exitCode=1;}).finally(()=>{app.quit();setTimeout(()=>fs.rmSync(temporary,{recursive:true,force:true}),1000).unref();});
