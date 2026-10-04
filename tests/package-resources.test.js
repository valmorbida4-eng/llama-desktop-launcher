'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const pkg=require('../package.json');
test('pacote público inclui somente manuais e licença como recursos extras',()=>{
 assert.deepEqual(pkg.build.extraResources,[
  {from:'docs/MANUAL-pt-BR.pdf',to:'docs/MANUAL-pt-BR.pdf'},
  {from:'docs/MANUAL-en.pdf',to:'docs/MANUAL-en.pdf'},
  {from:'LICENSE',to:'LICENSE'}
 ]);
});
