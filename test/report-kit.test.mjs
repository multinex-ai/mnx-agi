import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';import {exportReportKit} from '../tools/export-report-kit.mjs';
test('portable kit export preserves bytes and refuses overwriting an existing project directory',async()=>{
 const root=await mkdtemp(join(tmpdir(),'report-kit-'));try{
 const dir=join(root,'kit');const receipt=await exportReportKit(dir);
 for(const [name,hash] of Object.entries(receipt.hashes))assert.equal(createHash('sha256').update(await readFile(join(dir,name))).digest('hex'),hash);
 await assert.rejects(exportReportKit(dir),/Destination exists/);
 const contract=JSON.parse(await readFile(join(dir,'contract.json'),'utf8'));assert.equal(contract.sections.length,13);assert.equal(contract.brandAssetsIncluded,false);
 }finally{await rm(root,{recursive:true,force:true});}
});
