import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
export const root=path.resolve(process.env.DATA_DIR||'data');
import { createLikesStore } from './likes-store.js';
const likesStore=createLikesStore(root);
export const types=['recipes','meals','restaurants','likes','users','ingredients','tags','requests'];
export const hash=pin=>scryptSync(String(pin),'homecooked-local-v1',64).toString('hex');
export const validPin=(pin,digest)=>typeof digest==='string'&&digest.length===128&&timingSafeEqual(Buffer.from(hash(pin),'hex'),Buffer.from(digest,'hex'));
export const safe=id=>/^[a-zA-Z0-9-]+$/.test(id);
export async function read(type,id){if(!types.includes(type)||!safe(id))throw Error('Invalid record');if(type==='likes')return likesStore.read(id);return JSON.parse(await fs.readFile(path.join(root,type,id,'record.json'),'utf8'));}
export async function all(type){if(type==='likes')return likesStore.all();const entries=await fs.readdir(path.join(root,type),{withFileTypes:true});const records=await Promise.all(entries.filter(entry=>entry.isDirectory()&&safe(entry.name)).map(async entry=>{try{return await read(type,entry.name);}catch(error){if(error.code==='ENOENT')return null;throw error;}}));return records.filter(Boolean);}
export async function write(type,record){if(!types.includes(type)||!safe(record.id))throw Error('Invalid record');if(type==='likes')return likesStore.write(record);const dir=path.join(root,type,record.id);await fs.mkdir(dir,{recursive:true});const tmp=path.join(dir,`${randomUUID()}.tmp`);await fs.writeFile(tmp,JSON.stringify(record,null,2));await fs.rename(tmp,path.join(dir,'record.json'));return record;}
const markdownQueues=new Map();
export function updateMarkdown(type,id,transform){
 if(!types.includes(type)||!safe(id))return Promise.reject(Error('Invalid record'));
 const filename=path.join(root,type,id,'recipe.md');
 const previous=markdownQueues.get(filename)||Promise.resolve();
 const result=previous.catch(()=>{}).then(async()=>{
  let current='';try{current=await fs.readFile(filename,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  const body=transform(current);const tmp=filename+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(tmp,body);await fs.rename(tmp,filename);}finally{await fs.rm(tmp,{force:true});}
  return body;
 });
 markdownQueues.set(filename,result);
 const cleanup=()=>{if(markdownQueues.get(filename)===result)markdownQueues.delete(filename);};
 result.then(cleanup,cleanup);return result;
}
export async function markdown(type,id,body){return updateMarkdown(type,id,()=>body);}
export async function init(){await fs.mkdir(root,{recursive:true});for(const type of types.filter(type=>type!=='likes'))await fs.mkdir(path.join(root,type),{recursive:true});await likesStore.init();await fs.writeFile(path.join(root,'index.json'),JSON.stringify({version:1,collections:Object.fromEntries(types.map(type=>[type,type==='likes'?'likes.json':`${type}/`]))},null,2));if((await all('users')).length)return;
for(const user of [{id:'alex',name:'Alex',role:'admin',picture:'👩🏻‍🍳'},{id:'sam',name:'Sam',role:'cook',picture:'🧑🏽‍🍳'},{id:'jamie',name:'Jamie',role:'customer',picture:'👨🏼'},{id:'riley',name:'Riley',role:'customer',picture:'👧🏽'}])await write('users',{...user,pinHash:hash('1234')});
const restaurants=[{id:'comfort',name:'The Comfort Kitchen',cuisine:'Comfort food',description:'A little nostalgia. A lot of love.',image:'photo-1547592180-85f173990554',logo:'🍲'},{id:'italian',name:'Sunday at Nonna’s',cuisine:'Italian',description:'Pull up a chair. There’s always more.',image:'photo-1551183053-bf91a1d81141',logo:'🍝'},{id:'fresh',name:'The Green Table',cuisine:'Fresh & light',description:'Seasonal, colorful, feel-good food.',image:'photo-1512621776951-a57141f2eefd',logo:'🥬'}];for(const r of restaurants)await write('restaurants',r);
const recipes=[['roast','Lemon & herb roast chicken','comfort','photo-1532550907401-a500c9a57435',60,['Chicken','Lemon','Potatoes'],'Golden, cozy, and worth gathering around.'],['pasta','Creamy tomato rigatoni','italian','photo-1473093295043-cdd812d0e601',30,['Rigatoni','Tomatoes','Cream'],'A big bowl of Sunday comfort.'],['bowl','Harvest grain bowl','fresh','photo-1512621776951-a57141f2eefd',25,['Quinoa','Sweet potato','Avocado'],'All the good things, in one bowl.'],['soup','Roasted tomato soup','comfort','photo-1547592180-85f173990554',40,['Tomatoes','Onion','Vegetable stock'],'Best served with something to dip.'],['salad','Garden pesto pasta','italian','photo-1551183053-bf91a1d81141',25,['Pasta','Basil','Parmesan'],'Fresh basil and a generous sprinkle of parmesan.'],['toast','Avocado breakfast toast','fresh','photo-1525351484163-7529414344d8',15,['Sourdough','Avocado','Eggs'],'A sunny start to a slow morning.']];
for(const [id,name,restaurantId,image,minutes,ingredients,description]of recipes){await write('recipes',{id,name,restaurantId,image,minutes,ingredients,description,hidden:false,markdown:'recipe.md'});await markdown('recipes',id,`# ${name}\n\n${description}\n\n## Ingredients\n${ingredients.map(i=>'- '+i).join('\n')}\n\n## Method\n1. Gather and prepare your ingredients.\n2. Cook using your preferred method, seasoning to taste.\n3. Plate, garnish, and enjoy together.\n\n*Sample recipe: replace with your tested quantities and instructions before cooking.*`);}
}
