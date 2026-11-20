/** Export the neutral kit to a new directory. Never overwrites existing files. */
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export async function exportReportKit(destination) {
  const target=resolve(destination);
  try {await stat(target);throw new Error('Destination exists; choose a new staging directory.');}
  catch(error) {if(error.code!=='ENOENT')throw error;}
  const files=['components.css','contract.json'];
  const source=new URL('../report-kit/v1/',import.meta.url);
  const loaded=await Promise.all(files.map(async name=>({name,bytes:await readFile(new URL(name,source))})));
  await mkdir(target,{recursive:true});
  const hashes={};
  for(const {name,bytes} of loaded){await writeFile(resolve(target,name),bytes,{flag:'wx'});hashes[name]=createHash('sha256').update(bytes).digest('hex');}
  const receipt={kit:'Accords Report Kit',version:'1.0.0',hashes};
  await writeFile(resolve(target,'provenance.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  return receipt;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(!process.argv[2])throw new Error('Usage: node tools/export-report-kit.mjs <new-staging-directory>');
  console.log(JSON.stringify(await exportReportKit(process.argv[2]),null,2));
}
