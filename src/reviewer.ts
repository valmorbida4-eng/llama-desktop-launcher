'use strict';
// Revisor: um segundo llama-server generativo, sempre em loopback, para revisar o que o principal escreveu.
// Roda inteiro no dispositivo escolhido (sem -fit): ou cabe, ou o launcher não inicia.
const params=require('./params');

const ALIAS='modelo-revisor';
// 8081 é o padrão do campo "Revisor local" do DepTriagem.
const PORTS=Object.freeze({first:8081,last:8089});
const HOST='127.0.0.1';
const DEFAULTS=Object.freeze({device:'',context:'8192'});
// O driver da AMD reinicia quando um lote passa de 2 s na placa. Com o modelo inteiro no Vulkan, 128 passou
// nos testes da RX 6600 e da integrada; 512 derruba modelos densos.
const VULKAN_UBATCH=128;
const DEVICE=/^(?:|cpu|[A-Za-z][A-Za-z0-9_-]{0,62}\d)$/;
// Do perfil do modelo vale só o que não muda onde ele roda nem quanto contexto usa.
const PROFILE_FLAGS=Object.freeze({batch:'-b',ubatch:'-ub',cacheK:'-ctk',cacheV:'-ctv',flash:'-fa',threads:'-t'});

function validateOptions(options: any={}) {
  const device=String(options.device??DEFAULTS.device).trim();
  if(!DEVICE.test(device))throw Error('Dispositivo do revisor inválido.');
  const context=Number(options.context??DEFAULTS.context);
  if(!Number.isInteger(context)||context<1024||context>131072)throw Error('Contexto do revisor deve ficar entre 1024 e 131072 tokens.');
  return {device,context:String(context)};
}
function requireModel(model: any) {
  if(model?.decision||(model?.engine||'llamacpp')!=='llamacpp')throw Error('Escolha um modelo GGUF que gere texto para o revisor.');
}
// Argumentos comuns ao servidor e à estimativa de memória.
function memoryArgs(options: any,profile: any={}) {
  const o=validateOptions(options);
  const a=['-c',o.context,'-fit','off'];
  if(o.device==='cpu')a.push('-dev','none','-ngl','0');
  else {if(o.device)a.push('-dev',o.device);a.push('-ngl','999');}
  for(const [key,flag] of Object.entries(PROFILE_FLAGS)) {
    let value=String(profile?.[key]??'').trim();
    if(key==='ubatch'&&/^vulkan/i.test(o.device))value=String(Math.min(Number(value)||VULKAN_UBATCH,VULKAN_UBATCH));
    if(value&&value!=='auto')a.push(flag,value);
  }
  return a;
}
function serverArgs(model: any,options: any,port: number,profile: any={}) {
  requireModel(model);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('Porta do revisor inválida.');
  // O esforço fica fora de memoryArgs: o llama-fit-params não conhece essas opções.
  return ['-m',model.path,...memoryArgs(options,profile),...params.effortArgs(profile),'--parallel','1','--alias',ALIAS,'--host',HOST,'--port',String(port)];
}

module.exports={ALIAS,PORTS,HOST,DEFAULTS,VULKAN_UBATCH,validateOptions,requireModel,memoryArgs,serverArgs};
