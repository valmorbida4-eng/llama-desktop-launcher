'use strict';
// O que cada modelo suporta, lido sem carregar pesos: o cabeçalho de metadados do GGUF (llama.cpp), o
// config.json das pastas Hugging Face (vLLM) e as opções que o serve/server.py instalado do Strata aceita.
const fs=require('node:fs');
const path=require('node:path');

// Leitor sequencial com buffer: o cabeçalho de um GGUF pode ter dezenas de MB (vocabulário do tokenizer).
class FileReader {
  fd: number; buffer: Buffer; start=0; end=0; position=0; size: number;
  constructor(file: string) {this.fd=fs.openSync(file,'r');this.size=fs.fstatSync(this.fd).size;this.buffer=Buffer.alloc(1<<20);}
  close() {try{fs.closeSync(this.fd);}catch{}}
  ensure(n: number) {
    if(this.position+n<=this.end) return;
    if(this.position+n>this.size) throw Error('GGUF truncado.');
    if(n>this.buffer.length) this.buffer=Buffer.alloc(Math.max(n,this.buffer.length*2));
    const read=fs.readSync(this.fd,this.buffer,0,this.buffer.length,this.position);
    this.start=this.position;this.end=this.position+read;
    if(this.position+n>this.end) throw Error('GGUF truncado.');
  }
  at() {return this.position-this.start;}
  u8() {this.ensure(1);const v=this.buffer.readUInt8(this.at());this.position+=1;return v;}
  u32() {this.ensure(4);const v=this.buffer.readUInt32LE(this.at());this.position+=4;return v;}
  i32() {this.ensure(4);const v=this.buffer.readInt32LE(this.at());this.position+=4;return v;}
  u64() {this.ensure(8);const v=this.buffer.readBigUInt64LE(this.at());this.position+=8;return v;}
  i64() {this.ensure(8);const v=this.buffer.readBigInt64LE(this.at());this.position+=8;return v;}
  f32() {this.ensure(4);const v=this.buffer.readFloatLE(this.at());this.position+=4;return v;}
  f64() {this.ensure(8);const v=this.buffer.readDoubleLE(this.at());this.position+=8;return v;}
  skip(n: number) {if(this.position+n>this.size) throw Error('GGUF truncado.');this.position+=n;}
  string(limit=1<<16) {
    const length=Number(this.u64());
    if(length>limit){this.skip(length);return null;}
    this.ensure(length);const v=this.buffer.toString('utf8',this.at(),this.at()+length);this.position+=length;return v;
  }
}
const SCALAR_SIZE: Record<number, number>={0:1,1:1,2:2,3:2,4:4,5:4,6:4,7:1,10:8,11:8,12:8};
function readValue(r: FileReader,type: number): any {
  switch(type) {
    case 0: return r.u8();
    case 1: {const v=r.u8();return v>127?v-256:v;}
    case 2: {r.ensure(2);const v=r.buffer.readUInt16LE(r.at());r.position+=2;return v;}
    case 3: {r.ensure(2);const v=r.buffer.readInt16LE(r.at());r.position+=2;return v;}
    case 4: return r.u32();
    case 5: return r.i32();
    case 6: return r.f32();
    case 7: return r.u8()!==0;
    case 8: return r.string();
    case 10: return Number(r.u64());
    case 11: return Number(r.i64());
    case 12: return r.f64();
    case 9: {
      // Vetores: só o tamanho interessa (ex.: vocabulário); vetores numéricos curtos são guardados
      // porque alguns modelos usam um valor por camada (ex.: sliding_window_pattern).
      const itemType=r.u32(),count=Number(r.u64());
      if(itemType===8){for(let i=0;i<count;i++)r.skip(Number(r.u64()));return {length:count};}
      if(itemType===9) throw Error('GGUF com vetor aninhado.');
      const size=SCALAR_SIZE[itemType];if(!size) throw Error('Tipo GGUF desconhecido.');
      if(count<=4096){const items=[];for(let i=0;i<count;i++)items.push(readValue(r,itemType));return items;}
      r.skip(size*count);return {length:count};
    }
    default: throw Error('Tipo GGUF desconhecido.');
  }
}
function readGgufMetadata(file: string) {
  const r=new FileReader(file);
  try {
    r.ensure(4);if(r.buffer.toString('latin1',0,4)!=='GGUF') throw Error('Arquivo não é GGUF.');r.position=4;
    const version=r.u32();if(version<2||version>3) throw Error(`Versão GGUF ${version} não suportada.`);
    r.u64();const count=Number(r.u64());
    if(count>100000) throw Error('GGUF com metadados demais.');
    const kv: Record<string, any>={};
    for(let i=0;i<count;i++) {const key=r.string(1024);const type=r.u32();const value=readValue(r,type);if(key)kv[key]=value;}
    return kv;
  } finally {r.close();}
}
const num=(v: any)=>typeof v==='number'&&Number.isFinite(v)?v:Array.isArray(v)&&v.length&&v.every(x=>typeof x==='number')?Math.max(...v):null;
function ggufInfo(kv: Record<string, any>) {
  const arch=typeof kv['general.architecture']==='string'?kv['general.architecture']:'';
  const get=(suffix: string)=>num(kv[`${arch}.${suffix}`]);
  const expertCount=get('expert_count')||0;
  const slidingWindow=get('attention.sliding_window')||0;
  const recurrent=Object.keys(kv).some(k=>k.startsWith(`${arch}.ssm.`)||k.startsWith(`${arch}.wkv.`)||k.startsWith(`${arch}.shortconv.`));
  return {format:'gguf',architecture:arch,name:typeof kv['general.name']==='string'?kv['general.name']:'',blockCount:get('block_count'),contextLength:get('context_length'),
    expertCount,expertUsedCount:get('expert_used_count')||0,leadingDenseBlocks:get('leading_dense_block_count')||0,nextnLayers:get('nextn_predict_layers')||0,
    slidingWindow,recurrent,fileType:num(kv['general.file_type'])};
}
// Tipo 'model.kind' derivado: denso, MoE, SWA, híbrido/recorrente, com camadas MTP.
function hfInfo(config: any) {
  const c={...(config||{}),...(config?.text_config||{}),...(config?.llm_config||{})};
  const first=(...keys: string[])=>{for(const k of keys){const v=num(c[k]);if(v!==null)return v;}return null;};
  const quant=c.quantization_config?.quant_method||config?.quantization_config?.quant_method||(config?.compression_config?'compressed-tensors':null);
  return {format:'hf',architecture:String((config?.architectures||[])[0]||c.model_type||''),modelType:String(c.model_type||''),
    expertCount:first('num_experts','num_local_experts','n_routed_experts','moe_num_experts')||0,
    nextnLayers:first('num_nextn_predict_layers','mtp_num_hidden_layers','num_mtp_layers')||0,
    contextLength:first('max_position_embeddings','max_seq_len','seq_length','n_positions'),
    attentionHeads:first('num_attention_heads','n_head'),blockCount:first('num_hidden_layers','n_layer'),
    quantization:typeof quant==='string'?quant:null,dtype:String(c.torch_dtype||c.dtype||config?.torch_dtype||'')||null,
    slidingWindow:first('sliding_window')||0};
}
// Cache por caminho + tamanho + data, para não reler o cabeçalho a cada troca de campo.
const cache=new Map<string, {stamp: string; info: any}>();
function stampOf(file: string) {try{const s=fs.statSync(file);return `${s.size}:${s.mtimeMs}`;}catch{return '';}}
function cached(file: string,read: () => any) {
  const stamp=stampOf(file),hit=cache.get(file);
  if(hit&&hit.stamp===stamp) return hit.info;
  let info;try{info=read();}catch(error){info={error:error.message};}
  cache.set(file,{stamp,info});if(cache.size>200)cache.delete(cache.keys().next().value);
  return info;
}
function strataServerOptions(dir: string) {
  const file=path.join(dir,'serve','server.py');
  return cached(file,()=>{
    const text=fs.readFileSync(file,'utf8');const options=new Set<string>();
    for(const match of text.matchAll(/add_argument\(\s*["'](--[a-z0-9-]+)["']/g)) options.add(match[1]);
    return {format:'strata',options:[...options]};
  });
}
function strataConfig(file: string) {
  return cached(file,()=>{const config=JSON.parse(fs.readFileSync(file,'utf8'));return {format:'strata-config',gpu:config.gpu==null?null:String(config.gpu),
    args:Array.isArray(config.args)?config.args.map(String).slice(0,60):[],parallel:Number.isInteger(config.parallel)?config.parallel:null,modelName:config.model_name||null};});
}
function modelInfo(model: any,{strataDir=''}: any={}) {
  if(!model) return null;
  if(model.engine==='vllm') return cached(path.join(model.path,'config.json'),()=>hfInfo(JSON.parse(fs.readFileSync(path.join(model.path,'config.json'),'utf8'))));
  if(model.engine==='strata') return {...strataConfig(model.path),server:strataDir?strataServerOptions(strataDir):{options:[]}};
  return cached(model.path,()=>ggufInfo(readGgufMetadata(model.path)));
}
module.exports={readGgufMetadata,ggufInfo,hfInfo,modelInfo,strataServerOptions,strataConfig};
