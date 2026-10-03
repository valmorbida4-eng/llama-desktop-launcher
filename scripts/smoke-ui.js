'use strict';
// Opt-in Electron UI smoke test: npm run smoke:ui (or npm run smoke:ui:model)
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {app,BrowserWindow}=require('electron');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'llama-ui-smoke-'));
app.setPath('userData',temporary);
const withModel=process.argv.includes('--with-model');
if(withModel){
  const modelDir=path.join(temporary,'models'),engineDir=path.join(temporary,'engine');
  fs.mkdirSync(modelDir);fs.mkdirSync(engineDir);
  const modelPath=path.join(modelDir,'sample-q4_k_m.gguf');
  fs.writeFileSync(modelPath,Buffer.alloc(1024));
  fs.writeFileSync(path.join(engineDir,process.platform==='win32'?'llama-server.exe':'llama-server'),'');
  fs.writeFileSync(path.join(temporary,'settings.json'),JSON.stringify({modelDirs:[modelDir,''],engineDir,profiles:{},selectedModelPath:modelPath,firstRun:false,accessHost:'127.0.0.1',parallel:1}));
}
require('../build/app/main');

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
    const llamaInitiallyVisible=!document.getElementById('llama-view').hidden;
    const importButton=!!document.getElementById('import-profiles');
    const serverButton=!!document.getElementById('start-server');
    const chatButton=!!document.getElementById('start-chat');
    const firewallButton=!!document.getElementById('create-firewall');
    const backendSelect=document.getElementById('engine-backend');
    const backendChoices=Array.from(backendSelect?.options||[]).map(option=>option.value);
    const backendReady=backendChoices.length>0 && (state.platform!=='win32'||backendChoices.includes('cuda-12.4'));
    document.getElementById('nav-models').click();
    await new Promise(r=>setTimeout(r,250));
    const modelsVisible=!document.getElementById('models-view').hidden;
    const hardwareSuggestions=!!document.getElementById('guidance-summary').textContent;
    const modelFilters=['hf-moe','hf-dense','hf-full'].every(id=>!!document.getElementById(id));
    document.getElementById('nav-llama').click();
    const llamaVisible=!document.getElementById('llama-view').hidden;
    const tuningInAccordion=document.getElementById('tuning-content').contains(document.getElementById('tuning-panel'));
    const accordionClosed=!document.getElementById('tuning-accordion').open;
    const saveInAccordion=!document.getElementById('save-settings-profile').hidden;
    document.getElementById('nav-settings').click();
    const tuningInSettings=document.getElementById('tuning-settings-content').contains(document.getElementById('tuning-panel'));
    return {firstRun:state.config.firstRun,settingsVisible,llamaInitiallyVisible,importButton,serverButton,chatButton,firewallButton,backendReady,tuningInSettings,modelsVisible,hardwareSuggestions,modelFilters,llamaVisible,tuningInAccordion,accordionClosed,saveInAccordion,settingsAfterReturn:!document.getElementById('settings-view').hidden,selectedModel:document.getElementById('model').value===state.config.selectedModelPath};
  })()`);
  const expected=withModel?{firstRun:false,settingsVisible:false,llamaInitiallyVisible:true,selectedModel:true}:{firstRun:true,settingsVisible:true,llamaInitiallyVisible:false,selectedModel:true};
  if(Object.entries(result).some(([key,value])=>value!==(key in expected?expected[key]:true)))throw Error(`Estado da interface inesperado: ${JSON.stringify(result)}`);
  process.stdout.write(`OK interface Electron: ${JSON.stringify(result)}\n`);
}
main().catch(error=>{process.stderr.write(`${error.stack||error.message}\n`);process.exitCode=1;}).finally(()=>{app.quit();setTimeout(()=>fs.rmSync(temporary,{recursive:true,force:true}),1000).unref();});
