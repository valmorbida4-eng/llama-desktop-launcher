'use strict';
// Opt-in Electron smoke test dos motores extras: npm run smoke:engines
// Cria um GGUF, uma pasta Hugging Face e uma instalação falsa do PolyStrata e confere
// que a lista de modelos e os botões seguem o motor de cada modelo.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {app,BrowserWindow}=require('electron');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'llama-engines-smoke-'));
app.setPath('userData',temporary);
const modelDir=path.join(temporary,'models'),engineDir=path.join(temporary,'engine'),strataDir=path.join(temporary,'PolyStrata');
const write=(file,content='')=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);};
const gguf=path.join(modelDir,'sample-q4_k_m.gguf');
write(gguf,Buffer.alloc(1024));
write(path.join(modelDir,'Qwen3-8B-AWQ','config.json'),'{}');write(path.join(modelDir,'Qwen3-8B-AWQ','model.safetensors'),Buffer.alloc(2048));
write(path.join(engineDir,process.platform==='win32'?'llama-server.exe':'llama-server'));
write(path.join(strataDir,'serve','server.py'));write(path.join(strataDir,'polystrata.py'));
write(process.platform==='win32'?path.join(strataDir,'.venv','Scripts','python.exe'):path.join(strataDir,'.venv','bin','python'));
const strataConfig=path.join(strataDir,'strata-qwen36.json');
write(strataConfig,JSON.stringify({model_name:'Qwen3.6-35B-A3B',args:['--ctx','32768']}));
write(path.join(temporary,'settings.json'),JSON.stringify({modelDirs:[modelDir,''],engineDir,strataDir,profiles:{},selectedModelPath:gguf,firstRun:false,accessHost:'127.0.0.1',parallel:1}));
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
    await new Promise(r=>setTimeout(r,300));
    const byEngine=engine=>state.models.find(m=>m.engine===engine);
    const choose=async m=>{const select=document.getElementById('model');select.value=m.path;select.dispatchEvent(new Event('change'));await new Promise(r=>setTimeout(r,200));};
    const disabled=id=>document.getElementById(id).disabled;
    const engines=Object.fromEntries(state.engines.map(e=>[e.id,e]));
    const options=Array.from(document.getElementById('model').options).map(o=>o.value).filter(Boolean);
    await choose(byEngine('llamacpp'));const llama={server:!disabled('start-server'),chat:!disabled('start-chat'),cli:!disabled('open-cli-terminal')};
    await choose(byEngine('vllm'));const vllm={server:!disabled('start-server'),chat:!disabled('start-chat'),cli:!disabled('open-cli-terminal'),detail:document.getElementById('model-detail').textContent};
    await choose(byEngine('strata'));const strata={server:!disabled('start-server'),chat:!disabled('start-chat'),detail:document.getElementById('model-detail').textContent};
    return {
      threeModels:options.length===3,
      llamaControls:llama.server&&llama.chat&&llama.cli,
      vllmWaitsForEngine:!vllm.server&&!vllm.chat&&!vllm.cli&&vllm.detail.includes('motor pendente'),
      strataReady:engines.strata.ready&&strata.server&&!strata.chat&&strata.detail.includes('Strata'),
      strataContext:byEngine('strata').context===32768&&byEngine('strata').modelName==='Qwen3.6-35B-A3B',
      polystrataDetected:document.getElementById('strata-detail').textContent.includes('PolyStrata'),
      vllmCard:document.getElementById('vllm-badge').textContent==='Pendente'&&!document.getElementById('install-vllm').hidden,
      vllmMode:engines.vllm.mode===({linux:'venv',win32:'docker'}[state.platform]??null)
    };
  })()`);
  if(Object.values(result).some(value=>value!==true))throw Error(`Estado da interface inesperado: ${JSON.stringify(result)}`);
  process.stdout.write(`OK motores na interface: ${JSON.stringify(result)}\n`);
}
main().catch(error=>{process.stderr.write(`${error.stack||error.message}\n`);process.exitCode=1;}).finally(()=>{app.quit();setTimeout(()=>fs.rmSync(temporary,{recursive:true,force:true}),1000).unref();});
