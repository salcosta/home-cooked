import express from 'express';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {root,init,all,read,write,markdown,updateMarkdown,hash,validPin} from './store.js';
import { createSessionsStore } from './sessions-store.js';
import { ensureIngredients } from './ingredient-catalog.js';
import { appendRecipeNote } from './recipe-notes.js';
import { createRecipeScanner } from './recipe-scanner.js';
await init();
// Preserve legacy meal records while moving their unaccepted requests into the food queue.
const existingRequests=await all('requests');
for(const meal of await all('meals')){
 if(meal.status!=='Requested'||meal.convertedToRequests)continue;
 for(const recipeId of meal.recipeIds){
  let request=existingRequests.find(r=>r.recipeId===recipeId&&!r.mealId);
  if(!request){request={id:randomUUID(),recipeId,requestedBy:[],createdAt:meal.createdAt,mealId:null};existingRequests.push(request);}
  request.requestedBy=[...new Set([...request.requestedBy,meal.userId])];
  await write('requests',request);
 }
 await write('meals',{...meal,convertedToRequests:true});
}
await ensureIngredients((await all('recipes')).flatMap(recipe=>recipe.ingredients||[]));
createRecipeScanner(path.join(root,'recipes')).start();
const app=express();
const sessionsStore=createSessionsStore(root);
let sessions=await sessionsStore.load();
let sessionsSaveTimer=null;
const saveSessions=()=>{clearTimeout(sessionsSaveTimer);sessionsSaveTimer=setTimeout(()=>sessionsStore.save(sessions),1000);};
app.use(express.json({limit:'12mb'}));
const publicUser=({pinHash,...user})=>user;
app.get('/api/profiles',async(req,res)=>res.json((await all('users')).map(({id,name,picture})=>({id,name,picture}))));
const attempts=new Map();
app.post('/api/login',async(req,res)=>{const key=req.ip;const a=attempts.get(key)||{count:0,time:Date.now()};if(Date.now()-a.time>60000){a.count=0;a.time=Date.now();}attempts.set(key,a);if(++a.count>15)return res.status(429).json({error:'Too many attempts. Try again in a minute.'});try{const user=await read('users',String(req.body.id));if(!validPin(req.body.pin,user.pinHash))throw Error();const token=randomUUID();sessions[token]={id:user.id,expires:Date.now()+86400000};saveSessions();res.json({token,user:publicUser(user)});}catch{res.status(401).json({error:'That PIN did not match. Try again.'});}});
app.use('/api',async(req,res,next)=>{const session=sessions[req.headers.authorization?.replace('Bearer ','')];if(!session||session.expires<Date.now())return res.status(401).json({error:'Please sign in.'});req.user=await read('users',session.id);next();});
const cook=(req,res,next)=>req.user.role==='customer'?res.status(403).json({error:'Cook access required.'}):next();
const admin=(req,res,next)=>req.user.role!=='admin'?res.status(403).json({error:'Admin access required.'}):next();
app.post('/api/recipes/:id/notes',cook,async(req,res)=>{
 const recipe=await read('recipes',req.params.id);
 const body=await updateMarkdown('recipes',recipe.id,current=>appendRecipeNote(current,req.body.note));
 res.json({body});
});
app.get('/api/state',async(req,res)=>{const result={};for(const type of ['recipes','restaurants','meals','likes','ingredients','tags','requests'])result[type]=await all(type);if(req.user.role==='customer')result.recipes=result.recipes.filter(r=>!r.hidden);result.meals=result.meals.filter(m=>!m.convertedToRequests);result.users=(await all('users')).map(publicUser);res.json(result);});
let tagUpdates=Promise.resolve();
app.post('/api/tags',admin,async(req,res)=>{
 const name=typeof req.body.name==='string'?req.body.name.trim().replace(/\s+/g,' '):'';
 if(!name||name.length>50)return res.status(400).json({error:'Use a tag name between 1 and 50 characters.'});
 const operation=tagUpdates.catch(()=>{}).then(async()=>{
  if((await all('tags')).some(tag=>tag.name.toLowerCase()===name.toLowerCase()))return res.status(409).json({error:'That tag already exists.'});
  res.status(201).json(await write('tags',{id:randomUUID(),name}));
 });
 tagUpdates=operation;await operation;
});
app.get('/api/recipes/:id/markdown',async(req,res)=>{const r=await read('recipes',req.params.id);if(r.hidden&&req.user.role==='customer')return res.sendStatus(404);res.json({body:await fs.readFile(path.join(root,'recipes',r.id,'recipe.md'),'utf8')});});
app.post('/api/likes/:id',async(req,res)=>{await read('recipes',req.params.id);const id=`${req.user.id}-${req.params.id}`;let liked=false;try{liked=(await read('likes',id)).liked;}catch{}res.json(await write('likes',{id,userId:req.user.id,recipeId:req.params.id,liked:!liked}));});
app.post('/api/meals',cook,async(req,res)=>{const ids=[...new Set(req.body.recipeIds||[])];for(const id of ids){const r=await read('recipes',id);if(r.hidden&&req.user.role==='customer')return res.sendStatus(403);}if(req.body.freeform&&req.user.role!=='customer'){const id=randomUUID();await write('recipes',{id,name:String(req.body.freeform).slice(0,120),restaurantId:'comfort',ingredients:[],minutes:0,hidden:false,markdown:'recipe.md'});await markdown('recipes',id,`# ${req.body.freeform}\n\nAdd cooking notes here.`);ids.push(id);}if(!ids.length)return res.status(400).json({error:'Choose at least one dish.'});const meal=await write('meals',{id:randomUUID(),name:String(req.body.name||'').trim()||'A meal together',recipeIds:ids,userId:req.user.id,status:'Accepted',createdAt:new Date().toISOString(),scheduledAt:req.body.scheduledAt||null,ratings:{},photos:[],markdown:'recipe.md'});await markdown('meals',meal.id,'# Meal notes\n');res.json(meal);});
const statuses=['Requested','Accepted','Shopping','Prepping','Cooking','Ready'];
let foodUpdates=Promise.resolve();
function serializeFoods(operation){const result=foodUpdates.catch(()=>{}).then(operation);foodUpdates=result;return result;}
const pendingRequest=(request,meals)=>{const meal=meals.find(m=>m.id===request.mealId);return !meal||(meal.status!=='Ready'&&!(meal.readyRecipeIds||[]).includes(request.recipeId));};
app.post('/api/requests',async(req,res)=>serializeFoods(async()=>{
 const freeform=typeof req.body.freeform==='string'?req.body.freeform.trim().replace(/\s+/g,' '):'';
 if('freeform'in req.body&&(!freeform||freeform.length>120))return res.status(400).json({error:'Enter a food name of 1?120 characters.'});
 if(req.body.recipeIds!==undefined&&!Array.isArray(req.body.recipeIds))return res.status(400).json({error:'Choose valid foods.'});
 const ids=[...new Set(req.body.recipeIds||[])];
 if(!ids.length&&!freeform)return res.status(400).json({error:'Choose at least one food or enter a food name.'});
 for(const id of ids){const recipe=await read('recipes',id);if(recipe.archived||(recipe.hidden&&req.user.role==='customer'))return res.sendStatus(403);}
 if(freeform){
  let recipe=(await all('recipes')).find(r=>!r.archived&&!r.hidden&&r.name.toLowerCase()===freeform.toLowerCase());
  if(!recipe){
   recipe=await write('recipes',{id:randomUUID(),name:freeform,restaurantId:'',ingredients:[],minutes:0,hidden:false,offMenu:true,markdown:'recipe.md'});
   await markdown('recipes',recipe.id,`# ${freeform}\n\nAdd cooking notes here.`);
  }
  if(!ids.includes(recipe.id))ids.push(recipe.id);
 }
 const requests=await all('requests'),meals=await all('meals'),result=[];
 for(const recipeId of ids){
  let request=requests.find(r=>r.recipeId===recipeId&&pendingRequest(r,meals));
  if(!request){request={id:randomUUID(),recipeId,requestedBy:[],createdAt:new Date().toISOString(),mealId:null};requests.push(request);}
  request.requestedBy=[...new Set([...request.requestedBy,req.user.id])];
  result.push(await write('requests',request));
 }
 res.json(result);
}));
app.post('/api/requests/move',cook,async(req,res)=>serializeFoods(async()=>{
 if(!Array.isArray(req.body.requestIds)||!req.body.requestIds.length)return res.status(400).json({error:'Select requested foods.'});
 const requests=await Promise.all([...new Set(req.body.requestIds)].map(id=>read('requests',id)));
 if(requests.some(r=>r.mealId))return res.status(409).json({error:'A selected food has already been moved. Refresh and try again.'});
 let meal;
 if(req.body.mealId){meal=await read('meals',req.body.mealId);if(!['Requested','Accepted','Shopping'].includes(meal.status))return res.status(400).json({error:'Choose a meal that has not started cooking.'});}
 else{meal={id:randomUUID(),name:String(req.body.name||'').trim()||'A meal together',recipeIds:[],userId:req.user.id,status:'Accepted',createdAt:new Date().toISOString(),scheduledAt:req.body.scheduledAt||null,ratings:{},photos:[],markdown:'recipe.md'};}
 meal.recipeIds=[...new Set([...meal.recipeIds,...requests.map(r=>r.recipeId)])];
 await write('meals',meal);
 if(!req.body.mealId)await markdown('meals',meal.id,'# Meal notes\n');
 for(const request of requests)await write('requests',{...request,mealId:meal.id});
 res.json(meal);
}));
app.patch('/api/meals/:id',cook,async(req,res)=>{
 const id=req.params.id;
 await serializeFoods(async()=>{
  const m=await read('meals',id);
  if(req.body.recipeReady!==undefined){
   const change=req.body.recipeReady;
   if(!change||!m.recipeIds.includes(change.recipeId)||typeof change.ready!=='boolean')return res.status(400).json({error:'Choose a recipe in this meal and a ready state.'});
   if(!['Prepping','Cooking'].includes(m.status))return res.status(400).json({error:'Start the meal before marking recipes ready.'});
   m.readyRecipeIds=(m.readyRecipeIds||[]).filter(recipeId=>recipeId!==change.recipeId);
   if(change.ready)m.readyRecipeIds.push(change.recipeId);
  }
  if(req.body.complete===true){
   if(!['Prepping','Cooking'].includes(m.status)||!m.recipeIds.length||!m.recipeIds.every(recipeId=>(m.readyRecipeIds||[]).includes(recipeId)))return res.status(400).json({error:'Mark every recipe ready before finishing the meal.'});
   m.status='Ready';m.preparedAt=new Date().toISOString();
  }else if(req.body.status){
   if(!statuses.includes(req.body.status))return res.sendStatus(400);
   if(m.status==='Ready'&&['Prepping','Cooking'].includes(req.body.status)){m.readyRecipeIds=[];delete m.preparedAt;}
   m.status=req.body.status;if(m.status==='Ready')m.preparedAt=new Date().toISOString();
  }
  if('scheduledAt'in req.body)m.scheduledAt=req.body.scheduledAt;
  res.json(await write('meals',m));
 });

});
app.post('/api/meals/:id/rate',async(req,res)=>{const m=await read('meals',req.params.id);if(m.status!=='Ready'||![1,-1].includes(req.body.rating))return res.sendStatus(400);m.ratings[req.user.id]=req.body.rating;res.json(await write('meals',m));});
app.post('/api/ingredients',cook,async(req,res)=>{
 const name=typeof req.body.name==='string'?req.body.name.trim():'';
 if(!name)return res.status(400).json({error:'Enter an ingredient name.'});
 const catalog=await ensureIngredients([name]);
 const item=catalog.find(item=>item.name.toLowerCase()===name.toLowerCase());
 res.json(await write('ingredients',{...item,shopping:true,purchased:false}));
});
app.patch('/api/ingredients/:id',cook,async(req,res)=>{
 if(('displayName'in req.body||'removeImage'in req.body)&&req.user.role!=='admin')return res.status(403).json({error:'Admin access required.'});
 const item=await read('ingredients',req.params.id);
 if('displayName'in req.body){
  if(typeof req.body.displayName!=='string'||!req.body.displayName.trim()||req.body.displayName.trim().length>200)return res.status(400).json({error:'Use a display name between 1 and 200 characters.'});
  item.displayName=req.body.displayName.trim();
 }
 if('price'in req.body){
  const price=req.body.price;
  if(price!==''&&(!['number','string'].includes(typeof price)||!String(price).trim()||!Number.isFinite(Number(price))||Number(price)<0))return res.status(400).json({error:'Enter a valid non-negative price.'});
  item.price=price===''?'':Number(price);
 }
 for(const key of ['notes','purchased'])if(key in req.body)item[key]=req.body[key];
 if(req.body.purchased)item.lastPurchased=new Date().toISOString();
 if(req.body.removeImage===true)delete item.image;
 res.json(await write('ingredients',item));
});
app.post('/api/recipes',admin,async(req,res)=>{
 const {name,restaurantId='',tagIds=[],hidden=false,body=''}=req.body;
 if(typeof name!=='string'||!name.trim()||name.trim().length>200)return res.status(400).json({error:'Use a recipe name between 1 and 200 characters.'});
 if(typeof body!=='string'||typeof hidden!=='boolean')return res.status(400).json({error:'Invalid recipe details.'});
 const restaurants=await all('restaurants');
 if(typeof restaurantId!=='string'||(restaurantId&&!restaurants.some(r=>r.id===restaurantId)))return res.status(400).json({error:'Choose a valid restaurant.'});
 const tags=await all('tags');
 if(!Array.isArray(tagIds)||tagIds.some(id=>!tags.some(tag=>tag.id===id)))return res.status(400).json({error:'Choose valid recipe tags.'});
 const record={id:randomUUID(),name:name.trim(),restaurantId,tagIds:[...new Set(tagIds)],hidden,ingredients:[],minutes:0,markdown:'recipe.md'};
 await write('recipes',record);
 await markdown('recipes',record.id,body);
 res.status(201).json(record);
});
app.patch('/api/recipes/:id',admin,async(req,res)=>{const r=await read('recipes',req.params.id);if('ingredients'in req.body){if(!Array.isArray(req.body.ingredients)||req.body.ingredients.some(item=>typeof item!=='string'||!item.trim()))return res.status(400).json({error:'Ingredients must be a list of names.'});await ensureIngredients(req.body.ingredients);}if('tagIds'in req.body){const tags=await all('tags');if(!Array.isArray(req.body.tagIds)||req.body.tagIds.some(id=>!tags.some(tag=>tag.id===id)))return res.status(400).json({error:'Choose valid recipe tags.'});r.tagIds=[...new Set(req.body.tagIds)];}for(const key of ['name','restaurantId','hidden','ingredients','minutes'])if(key in req.body)r[key]=req.body[key];if(typeof req.body.body==='string')await markdown('recipes',r.id,req.body.body);res.json(await write('recipes',r));});
app.delete('/api/recipes/:id',admin,async(req,res)=>{const r=await read('recipes',req.params.id);r.hidden=true;r.archived=true;res.json(await write('recipes',r));});
app.post('/api/restaurants',admin,async(req,res)=>{
 const fields={};
 for(const [key,max] of Object.entries({name:120,cuisine:80,description:300,logo:40})){
  const value=req.body[key]??'';
  if(typeof value!=='string'||value.trim().length>max)return res.status(400).json({error: key+' must be text of at most '+max+' characters.'});
  fields[key]=value.trim();
 }
 if(!fields.name)return res.status(400).json({error:'Enter a restaurant name.'});
 fields.cuisine ||= fields.name;
 fields.logo ||= '???';
 res.status(201).json(await write('restaurants',{id:randomUUID(),...fields}));
});
app.patch('/api/restaurants/:id',admin,async(req,res)=>{const r=await read('restaurants',req.params.id);for(const key of ['name','cuisine','description','logo'])if(key in req.body)r[key]=req.body[key];res.json(await write('restaurants',r));});
app.post('/api/users',admin,async(req,res)=>{if(!req.body.name||!/^\d{4,8}$/.test(req.body.pin)||!['admin','cook','customer'].includes(req.body.role))return res.status(400).json({error:'Name, role and a 4–8 digit PIN are required.'});res.json(publicUser(await write('users',{id:randomUUID(),name:req.body.name,role:req.body.role,picture:'🙂',pinHash:hash(req.body.pin)})));});
app.patch('/api/users/:id',async(req,res)=>{if(req.user.role!=='admin'&&req.user.id!==req.params.id)return res.sendStatus(403);const u=await read('users',req.params.id);if(req.body.picture)u.picture=req.body.picture;if(req.user.role==='admin'){if(req.body.name)u.name=req.body.name;if(req.body.pin){if(!/^\d{4,8}$/.test(req.body.pin))return res.sendStatus(400);u.pinHash=hash(req.body.pin);}}res.json(publicUser(await write('users',u)));});
app.post('/api/upload/:type/:id',async(req,res)=>{const {type,id}=req.params;if(!['recipes','restaurants','users','meals','ingredients'].includes(type))return res.sendStatus(400);if(type==='users'?req.user.id!==id&&req.user.role!=='admin':['recipes','restaurants'].includes(type)?req.user.role!=='admin':req.user.role==='customer')return res.sendStatus(403);const record=await read(type,id);const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(req.body.image||'');if(!match)return res.status(400).json({error:'Use a PNG, JPEG or WebP image.'});const filename=`${randomUUID()}.${match[1]}`;await fs.writeFile(path.join(root,type,id,filename),Buffer.from(match[2],'base64'));const url=`/assets-data/${type}/${id}/${filename}`;if(type==='meals')record.photos.push(url);else record[type==='users'?'picture':req.body.field==='logo'&&type==='restaurants'?'logo':'image']=url;await write(type,record);res.json({url});});
app.get('/assets-data/:type/:id/:file',async(req,res)=>{const {type,id,file}=req.params;if(!['users','recipes','restaurants','meals','ingredients'].includes(type)||!/^[-a-zA-Z0-9]+$/.test(id)||!/^[-a-zA-Z0-9]+\.(png|jpeg|webp)$/.test(file))return res.sendStatus(404);res.sendFile(path.join(root,type,id,file));});
app.use(express.static('dist'));app.get('/{*path}',(req,res)=>res.sendFile(path.resolve('dist/index.html')));
app.use((err,req,res,next)=>{console.error(err.message);res.status(400).json({error:'Unable to complete that action. Check your input and try again.'});});
app.listen(process.env.PORT||3001,()=>console.log('HomeCooked API: http://localhost:3001'));
