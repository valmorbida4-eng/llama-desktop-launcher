'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../src/engine');

const release={tag_name:'b11193',assets:[
  'llama-b11193-bin-win-vulkan-x64.zip',
  'llama-b11193-bin-win-cuda-12.4-x64.zip',
  'cudart-llama-bin-win-cuda-12.4-x64.zip',
  'llama-b11193-bin-win-rocm-10.0-x64.zip',
  'llama-b11193-bin-win-sycl-x64.zip',
  'llama-b11193-bin-ubuntu-vulkan-x64.tar.gz',
  'llama-b11193-bin-ubuntu-cuda-12.8-x64.tar.gz',
  'cudart-llama-b11193-bin-ubuntu-cuda-12.8-x64.tar.gz',
  'llama-b11193-bin-macos-arm64.tar.gz'
].map(name=>({name,size:1}))};

test('backend choices follow the operating system and architecture, independent of CPU vendor',()=>{
  assert.deepEqual(engine.backendOptions('win32','x64').map(x=>x.id),['vulkan','cuda-12.4','cuda-13.4','rocm-10.0','sycl','cpu']);
  assert.ok(engine.backendOptions('linux','x64').some(x=>x.id==='cuda-12.8'));
  assert.deepEqual(engine.backendOptions('darwin','arm64').map(x=>x.id),['metal']);
  assert.deepEqual(engine.backendOptions('win32','s390x'),[]);
});

test('CUDA requires both the llama.cpp archive and matching CUDA libraries',()=>{
  const selected=engine.assetsFor(release,'cuda-12.4','win32','x64');
  assert.equal(selected.main.name,'llama-b11193-bin-win-cuda-12.4-x64.zip');
  assert.equal(selected.runtime.name,'cudart-llama-bin-win-cuda-12.4-x64.zip');
  assert.throws(()=>engine.assetsFor({...release,assets:release.assets.filter(x=>!x.name.startsWith('cudart-'))},'cuda-12.4','win32','x64'),/não contém todos os pacotes/);
});

test('Vulkan, AMD, Intel, and Metal use the official package for their backend',()=>{
  for(const [platform,arch,backend,ending] of [
    ['win32','x64','vulkan','win-vulkan-x64.zip'],
    ['win32','x64','rocm-10.0','win-rocm-10.0-x64.zip'],
    ['win32','x64','sycl','win-sycl-x64.zip'],
    ['linux','x64','vulkan','ubuntu-vulkan-x64.tar.gz'],
    ['darwin','arm64','metal','macos-arm64.tar.gz']
  ]) assert.ok(engine.assetsFor(release,backend,platform,arch).main.name.endsWith(ending));
});
