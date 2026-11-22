'use strict';
// Decisor: um segundo llama-server, ao lado do servidor principal, só para modelos de decisão
// (d1-Omni, Julia-1, Kev-4B…). Eles não geram texto: respondem pela API /v1/systemone com a
// probabilidade de cada opção (choice), um sim/não (noul) ou uma nota (score).
const network=require('./network');

const ALIAS='decisor';
// 8099 fica livre para o servidor de decisões gerenciado por fora (projeto decisoes).
const PORTS=Object.freeze({first:8090,last:8098});
const DEFAULTS=Object.freeze({device:'',context:'4096',host:'127.0.0.1'});
const DEVICE=/^(?:|cpu|[A-Za-z][A-Za-z0-9_-]{0,62}\d)$/;
// Até este tamanho de arquivo (o Julia-1 tem 160 MiB) o decisor responde a tempo só na CPU. Medido no Ryzen 4650G
// com texto longo: Julia-1 1,6 s; d1-Omni 600M 10 s; Laya 17 s; Kev-4B 65 s.
const CPU_MAX_BYTES=256*1024**2;
function runsWellOnCpu(model: any) {return model.size>0&&model.size<=CPU_MAX_BYTES;}

// Modelos de decisão gravam metadados <arquitetura>.decision.* no GGUF (tipo, rótulos, cabeças).
function decisionType(kv: Record<string, any>) {
  const arch=typeof kv?.['general.architecture']==='string'?kv['general.architecture']:'';
  if(!arch) return null;
  const prefix=`${arch}.decision.`;
  if(!Object.keys(kv).some(k=>k.startsWith(prefix))) return null;
  const type=kv[`${prefix}type`];
  return typeof type==='string'&&type?type:arch;
}

function validateOptions(options: any={}) {
  const device=String(options.device??DEFAULTS.device).trim();
  if(!DEVICE.test(device)) throw Error('Dispositivo do decisor inválido.');
  const context=Number(options.context??DEFAULTS.context);
  if(!Number.isInteger(context)||context<512||context>32768) throw Error('Contexto do decisor deve ficar entre 512 e 32768 tokens.');
  const host=String(options.host??DEFAULTS.host);
  if(network.scopeOf(host)===null) throw Error('Endereço de rede do decisor inválido.');
  return {device,context:String(context),host};
}

function deviceArgs(device: string) {return device==='cpu'?['-dev','none','-ngl','0']:[...(device?['-dev',device]:[]),'-ngl','99'];}
// O que define o consumo de memória; a checagem de recursos usa os mesmos argumentos.
function memoryArgs(options: any) {const o=validateOptions(options);return ['-c',o.context,'-b',o.context,'-ub',o.context,...deviceArgs(o.device)];}
// A pergunta e as opções precisam caber num único lote: batch e microbatch acompanham o contexto.
function serverArgs(model: any, options: any, port: number, keyPath: string | null=null) {
  const o=validateOptions(options);
  if(!Number.isInteger(port)||port<1||port>65535) throw Error('Porta do decisor inválida.');
  const a=['-m',model.path,'-c',o.context,'-b',o.context,'-ub',o.context,'--alias',ALIAS,'--host',o.host,'--port',String(port)];
  a.push(...deviceArgs(o.device));
  if(model.projector) a.push('--mmproj',model.projector);
  if(o.host!=='127.0.0.1') {if(!keyPath) throw Error('Chave de API obrigatória na rede.');a.push('--api-key-file',keyPath);}
  return a;
}

// Pedido de teste da tela: um texto (state), uma pergunta e de 2 a 10 opções, uma por linha.
// Uma opção só, "sim/não" ou nenhuma vira pergunta noul (probabilidade de sim).
function testRequest({state='',question='',options=''}: any) {
  const text=String(state).trim(),ask=String(question).trim();
  if(!ask) throw Error('Escreva a pergunta do teste.');
  if(text.length>20000||ask.length>2000) throw Error('Texto de teste grande demais.');
  // Cada linha: "opção" ou "opção: quando escolher". A descrição melhora muito o acerto dos modelos pequenos.
  const criteria=new Map<string, string | null>();
  for(const line of String(options).split(/\r?\n/)){const at=line.indexOf(':');const name=(at<0?line:line.slice(0,at)).trim(),desc=at<0?'':line.slice(at+1).trim();if(name&&!criteria.has(name))criteria.set(name,desc||null);}
  const list=[...criteria.keys()];
  if(list.length>10) throw Error('Use no máximo 10 opções.');
  const yesNo=list.length===0||(list.length===2&&list.every(x=>/^(sim|não|nao|yes|no)$/i.test(x)));
  if(!yesNo&&list.length<2) throw Error('Informe pelo menos duas opções, uma por linha, ou deixe vazio para sim/não.');
  const q=yesNo?{type:'noul',instructions:ask}:{type:'choice',instructions:ask,criteria:Object.fromEntries(criteria)};
  return {state:text||null,questions:{teste:q}};
}

// Resume a resposta do /v1/systemone para a tela: opção escolhida e probabilidades em ordem.
function describeAnswer(response: any) {
  const answer=response?.answers?.teste;
  if(!answer) throw Error('O decisor não devolveu resposta.');
  const pct=(x: number)=>`${(x*100).toFixed(1)}%`;
  if(answer.type==='noul') return {headline:`Sim: ${pct(answer.noul)}`,rows:[['sim',answer.noul],['não',1-answer.noul]]};
  const rows=Object.entries(answer.probabilities||{}).map(([k,v])=>[answer.legend?.[k]??k,Number(v)] as [string,number]).sort((a,b)=>b[1]-a[1]);
  const top=answer.type==='score'?(answer.legend?.[String(Math.round(answer.score))]??answer.score):answer.choice;
  return {headline:`${top} (${pct(answer.confidence??rows[0]?.[1]??0)})`,rows};
}

// Modelos de decisão com GGUF para o llama.cpp (blog do ggml-org e documentação da Liquid AI, out/2026).
const MODELS=Object.freeze([
  {id:'d1Omni2b',match:String.raw`d1-?omni-?2b`,name:'d1-Omni 2B (Liquid AI)',size:'2,2B · ~2 GB em Q8',languages:'16 idiomas, inclui português',media:'texto, imagem e áudio',note:'O mais indicado para português. Precisa de llama.cpp b11960 ou mais novo.',url:'https://huggingface.co/LiquidAI/d1-Omni-2B-GGUF'},
  {id:'d1Omni600m',match:String.raw`d1-?omni-?600m`,name:'d1-Omni 600M (Liquid AI)',size:'0,6B · ~0,7 GB em Q8',languages:'mesmos idiomas do 2B',media:'texto, imagem e áudio',note:'Versão leve do d1-Omni: cabe com folga na CPU ou na GPU integrada.',url:'https://huggingface.co/LiquidAI/d1-omni-600M-GGUF'},
  {id:'julia1',match:String.raw`julia-?1`,name:'Julia-1',size:'144M · ~0,2 GB',languages:'mais de 50 idiomas',media:'texto',note:'Minúsculo e muito rápido (milissegundos na CPU); acerta menos em casos vagos.',url:'https://huggingface.co/ggml-org/Julia-1-GGUF'},
  {id:'kev4b',match:String.raw`kev-?4b`,name:'Kev-4B',size:'4B · ~4,3 GB em Q8',languages:'inglês',media:'texto',note:'Mais preciso que os pequenos; prefira GPU. Perguntas em inglês rendem melhor.',url:'https://huggingface.co/ggml-org/Kev-4B-GGUF'},
  {id:'laya',match:String.raw`laya`,name:'Laya',size:'421M · ~0,5 GB',languages:'inglês',media:'texto',note:'Pequeno e rápido, só inglês.',url:'https://huggingface.co/ggml-org/Laya-GGUF'},
  {id:'lev',match:String.raw`(?:^|[^a-z])lev(?:[^a-z]|$)`,name:'lev',size:'4B · ~4,3 GB em Q8',languages:'inglês',media:'texto',note:'Alternativa de 4B ao Kev-4B.',url:'https://huggingface.co/ggml-org/lev-GGUF'},
]);
const links=Object.freeze({
  ...Object.fromEntries(MODELS.map(m=>[m.id,m.url])),
  deciderAll:'https://huggingface.co/blog/ggml-org/decision-models-in-llamacpp',
});

module.exports={ALIAS,PORTS,DEFAULTS,CPU_MAX_BYTES,runsWellOnCpu,decisionType,validateOptions,memoryArgs,serverArgs,testRequest,describeAnswer,MODELS,links};
