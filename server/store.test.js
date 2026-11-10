import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile}from'node:fs/promises';
import os from'node:os';
import path from'node:path';
test('folder store seeds once, preserves records and verifies PINs',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'homecooked-'));process.env.DATA_DIR=dir;const store=await import('./store.js');try{await store.init();assert.equal((await store.all('users')).length,4);const alex=await store.read('users','alex');assert.ok(store.validPin('1234',alex.pinHash));assert.equal(store.validPin('0000',alex.pinHash),false);await store.write('users',{...alex,name:'Changed'});await store.init();assert.equal((await store.read('users','alex')).name,'Changed');assert.ok((await readFile(path.join(dir,'recipes','roast','recipe.md'),'utf8')).includes('# Lemon'));await assert.rejects(()=>store.read('users','../index'));assert.deepEqual(Object.keys(JSON.parse(await readFile(path.join(dir,'index.json'),'utf8')).collections),store.types);}finally{await rm(dir,{recursive:true,force:true});}});
