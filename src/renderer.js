'use strict';
const $=id=>document.getElementById(id);
let snapshot,activePath='';
let currentView=null;
$('home-view').append(document.querySelector('.hero'),$('setup-hint'),document.querySelector('.model-card'),$('start-chat').closest('section'),$('firewall-controls'));
$('settings-content').append(document.querySelector('.columns'));
function showView(view){currentView=view;$('home-view').hidden=view!=='models';$('settings-view').hidden=view!=='settings';$('nav-models').classList.toggle('active',view==='models');$('nav-settings').classList.toggle('active',view==='settings');}
const keys=['gpuLayers','device','context','cpuMoe','cacheK','cacheV','flash','threads','batch','ubatch'];
const caches=['f16','q8_0','q4_0','q5_0','q4_1','q5_1','f32','bf16','iq4_nl'];
for(const key of ['cacheK','cacheV']) $(key).innerHTML=caches.map(v=>`<option>${v}</option>`).join('');
function message(text,error=false){const box=currentView==='settings'?$('settings-message'):$('message');box.textContent=text;box.classList.toggle('error',error);}
async function action(fn){try{await fn();}catch(e){message(e.message||String(e),true);}}
function settings(){const v={};for(const key of keys)v[key]=$(key).value.trim();return v;}
function applySettings(v){for(const key of keys)$(key).value=String(v?.[key]??'');}
function selected(){return snapshot.models.find(m=>m.path===$('model').value);}
async function refresh(preferred){snapshot=await window.llama.state();const s=snapshot;if(currentView===null)showView(s.config.firstRun?'settings':'models');const old=preferred||$('model').value;const gb=(s.hardware.memoryBytes/1024**3).toFixed(0);$('memory').textContent=`${gb} GB`;$('cpu').textContent=`${s.hardware.logicalCores} threads`;$('platform').textContent=({win32:'Windows · Vulkan',linux:'Linux · Vulkan',darwin:'macOS · Metal'})[s.platform]||s.platform;$('engine-status').textContent=s.engineReady?'Pronto':'Pendente';$('engine-badge').textContent=s.engineReady?'Pronto':'Pendente';$('engine-path').textContent=s.config.engineDir||'Nenhuma pasta selecionada';$('folder-0').textContent=s.config.modelDirs[0];$('folder-1').textContent=s.config.modelDirs[1]||'Não configurado';$('model').replaceChildren(...s.models.map(m=>{const o=document.createElement('option');o.value=m.path;o.textContent=m.name;return o;}));if(s.models.some(m=>m.path===old))$('model').value=old;activePath='';chooseModel();$('setup-hint').hidden=s.engineReady&&s.models.length>0;$('launch').disabled=!s.engineReady||!s.models.length||s.running||s.chatRunning;$('stop').hidden=!s.running;$('start-chat').disabled=!s.engineReady||!s.models.length||s.running||s.chatRunning;$('stop-chat').hidden=!s.chatRunning;$('send-chat').disabled=!s.chatRunning;$('access-host').replaceChildren(...s.accessOptions.map(item=>{const o=document.createElement('option');o.value=item.host;o.textContent=item.name;return o;}));$('access-host').value=s.accessOptions.some(x=>x.host===s.config.accessHost)?s.config.accessHost:'127.0.0.1';$('parallel').value=s.config.parallel||1;$('access-host').disabled=s.running;$('parallel').disabled=s.running;$('rotate-key').disabled=s.running;updateNetwork();showConnection(s.active);$('firewall-controls').hidden=s.platform!=='win32'||!s.active||s.active.scope==='Local';}
function updateNetwork(){$('network-controls').hidden=$('access-host').value==='127.0.0.1';$('key-value').hidden=true;$('key-value').textContent='';}
function showConnection(result){$('connection').hidden=!result;$('firewall-controls').hidden=snapshot?.platform!=='win32'||!result||result.scope==='Local';if(result){$('endpoint').textContent=`API: ${result.endpoint} · Interface: ${result.remoteUrl}`;if(result.scope!=='Local'){$('firewall-range').value=result.scope==='Tailscale'?'100.64.0.0/10':result.host.split('.').slice(0,3).join('.')+'.0/24';}}}
$('nav-settings').onclick=()=>showView('settings');
$('open-settings').onclick=()=>showView('settings');
$('nav-models').onclick=()=>action(async()=>{if(snapshot?.config.firstRun)await window.llama.completeSetup();showView('models');});
$('finish-setup').onclick=()=>action(async()=>{await window.llama.completeSetup();snapshot=await window.llama.state();showView('models');});
function chooseModel(){const m=selected();if(!m){$('model-detail').textContent='Nenhum GGUF encontrado. Escolha uma pasta ou baixe um modelo.';applySettings({});return;}$('model-detail').textContent=`${(m.size/1024**3).toFixed(2)} GB · ${m.path}${m.projector?' · projetor multimodal detectado':''}`;activePath=m.path;applySettings(snapshot.config.profiles[m.path]||{gpuLayers:'auto',device:'',context:4096,cpuMoe:'',cacheK:'f16',cacheV:'f16',flash:'auto',threads:'',batch:512,ubatch:256});}
$('model').addEventListener('change',chooseModel);
$('refresh').onclick=()=>action(()=>refresh());
document.querySelectorAll('[data-folder]').forEach(b=>b.onclick=()=>action(async()=>{snapshot=await window.llama.chooseDir('models',Number(b.dataset.folder));await refresh();}));
document.querySelectorAll('[data-clear-folder]').forEach(b=>b.onclick=()=>action(async()=>{await window.llama.clearDir(Number(b.dataset.clearFolder));await refresh();}));
document.querySelectorAll('[data-open-folder]').forEach(b=>b.onclick=()=>action(()=>window.llama.openModelDir(Number(b.dataset.openFolder))));
$('select-engine').onclick=()=>action(async()=>{await window.llama.chooseDir('engine');await refresh();});
$('import-profiles').onclick=()=>action(async()=>{const result=await window.llama.importLegacyProfiles();if(!result)return;await refresh();message(`Perfis importados: ${result.imported}. Sem modelo no local configurado: ${result.missing}. Já existentes: ${result.existing}. Linhas inválidas: ${result.invalid}.`);});
$('install-engine').onclick=()=>action(async()=>{message('Buscando release oficial do llama.cpp…');$('install-engine').disabled=true;$('download-progress').hidden=false;try{await window.llama.installEngine();message('Motor instalado.');await refresh();}finally{$('install-engine').disabled=false;$('download-progress').hidden=true;}});
$('hf-moe').onclick=()=>action(()=>window.llama.openHF('moe'));
$('hf-dense').onclick=()=>action(()=>window.llama.openHF('dense'));
$('hf-moe-home').onclick=()=>action(()=>window.llama.openHF('moe'));
$('hf-dense-home').onclick=()=>action(()=>window.llama.openHF('dense'));
$('manual-pt').onclick=()=>action(()=>window.llama.openManual('pt-BR'));
$('manual-en').onclick=()=>action(()=>window.llama.openManual('en'));
$('recommend').onclick=()=>action(async()=>{const m=selected();if(!m)throw Error('Escolha um modelo.');applySettings(await window.llama.recommend(m.path));message('Sugestão aplicada aos campos. O modelo não foi executado. Clique em Salvar ajustes para guardar os valores.');});
$('tune').onclick=()=>action(async()=>{const m=selected();if(!m)throw Error('Escolha um modelo.');$('tune').disabled=true;message('Comparando microbatch com llama-bench. Isso pode levar alguns minutos.');try{const result=await window.llama.tune(m.path,settings());applySettings(result.settings);const best=result.results.find(r=>r.ubatch===result.settings.ubatch);message(`Microbatch ${best.ubatch} escolhido: geração ${best.generationTps.toFixed(1)} tokens/s. Os outros campos não mudaram. Clique em Salvar ajustes para guardar.`);}finally{$('tune').disabled=false;}});
$('save').onclick=()=>action(async()=>{const m=selected();if(!m)throw Error('Escolha um modelo.');await window.llama.saveProfile(m.path,settings());message('Ajustes salvos para este modelo.');});
$('access-host').onchange=updateNetwork;
$('show-key').onclick=()=>action(async()=>{if(!$('key-value').hidden){$('key-value').hidden=true;$('key-value').textContent='';return;}$('key-value').textContent=await window.llama.getKey();$('key-value').hidden=false;});
$('copy-key').onclick=()=>action(async()=>{await window.llama.copyKey();message('Chave copiada. Evite colá-la em locais públicos.');});
$('rotate-key').onclick=()=>action(async()=>{$('key-value').textContent=await window.llama.rotateKey();$('key-value').hidden=false;message('Nova chave criada. A anterior deixou de funcionar.');});
$('copy-endpoint').onclick=()=>action(async()=>{await window.llama.copyEndpoint();message('Link da API copiado.');});
$('copy-browser-link').onclick=()=>action(async()=>{await window.llama.copyBrowserLink();message('Link da interface copiado. Envie também a chave de API por um canal seguro.');});
$('create-firewall').onclick=()=>action(async()=>{$('create-firewall').disabled=true;try{await window.llama.createFirewallRule($('firewall-range').value.trim());message('Regra de firewall criada para a porta ativa e a faixa informada.');}finally{$('create-firewall').disabled=false;}});
$('launch').onclick=()=>action(async()=>{const m=selected();if(!m)throw Error('Escolha um modelo.');$('launch').disabled=true;message('Carregando modelo…');try{const result=await window.llama.launch(m.path,settings(),{host:$('access-host').value,parallel:Number($('parallel').value)});snapshot.active=result;showConnection(result);message(`Interface aberta: ${result.browserUrl}`);$('stop').hidden=false;$('access-host').disabled=true;$('parallel').disabled=true;$('rotate-key').disabled=true;}catch(e){$('launch').disabled=false;throw e;}});
$('stop').onclick=()=>action(async()=>{await window.llama.stop();message('Encerrando servidor…');});
$('start-chat').onclick=()=>action(async()=>{const m=selected();if(!m)throw Error('Escolha um modelo.');$('chat-output').textContent='Carregando modelo…\n';await window.llama.startChat(m.path,settings());$('start-chat').disabled=true;$('stop-chat').hidden=false;$('send-chat').disabled=false;$('launch').disabled=true;});
$('open-cli-terminal').onclick=()=>action(async()=>{const m=selected();if(!m)throw Error('Escolha um modelo.');await window.llama.openCliTerminal(m.path,settings());message('CLI aberto em um terminal separado. Encerre-o nessa janela quando terminar.');});
$('send-chat').onclick=()=>action(async()=>{const value=$('chat-input').value;if(!value.trim())return;await window.llama.sendChat(value);$('chat-input').value='';});
$('chat-input').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();$('send-chat').click();}});
$('stop-chat').onclick=()=>action(async()=>{await window.llama.stopChat();$('stop-chat').disabled=true;});
window.llama.onProgress(p=>{$('progress-bar').style.width=`${Math.min(100,p)}%`;$('progress-text').textContent=`Baixando… ${p}%`;});
window.llama.onTuneProgress(text=>message(text));
window.llama.onLog(line=>{const box=$('log');box.textContent=(box.textContent+line).slice(-30000);box.scrollTop=box.scrollHeight;});
window.llama.onStopped(code=>{message(`Servidor encerrado (${code??'sem código'}).`);snapshot.active=null;showConnection(null);$('stop').hidden=true;$('launch').disabled=false;$('access-host').disabled=false;$('parallel').disabled=false;$('rotate-key').disabled=false;});
window.llama.onChatOutput(data=>{const box=$('chat-output');box.textContent=(box.textContent+data.text).slice(-100000);box.scrollTop=box.scrollHeight;});
window.llama.onChatStopped(result=>{$('chat-output').textContent+=`\n[Conversa encerrada: ${result.code??result.signal??'sem código'}]\n`;$('stop-chat').hidden=true;$('stop-chat').disabled=false;$('send-chat').disabled=true;$('start-chat').disabled=false;$('launch').disabled=false;});
refresh().catch(e=>message(e.message,true));
