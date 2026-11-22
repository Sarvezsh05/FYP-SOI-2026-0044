// CloudVault website + application API: no npm packages needed in local mode.
// Selected deliberately weak paths work only in LAB_MODE on localhost with dummy data.
const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const storage=require('./storage');
const {sendResetEmail}=require('./mailer');
const config=require('./config');
const db=require('./db');
const {record}=require('./events');
const {send,bad,readJson,cookies,token,publicUser,number,safeFilename,ip}=require('./helpers');
const sessions=new Map();
const publicDir=path.join(__dirname,'public');
const uploads=path.join(config.dataDir,'uploads');
fs.mkdirSync(uploads,{recursive:true});
const limit=10*1024*1024; // 10 MiB maximum; upgrade to multipart uploads for very large files.

async function currentUser(req){
 const session=sessions.get(cookies(req).cv_session);
 if(!session || session.expires<Date.now()) return {user:null,session:null};
 const user=await db.one('SELECT * FROM users WHERE user_id=?',[session.userId]);
 return {user,session};
}
function newSession(res,id){
 const idToken=token();
 const session={userId:id,csrf:token(),expires:Date.now()+12*3600*1000};
 sessions.set(idToken,session);
 res.setHeader('Set-Cookie',`cv_session=${idToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${config.cookieSecure?'; Secure':''}`);
 return session;
}
async function audit(req,user,type,description,status='success',severity='low'){
 const source_ip=ip(req);
 try{
  await db.run('INSERT INTO activity_logs(user_id,event_type,ip_address,request_path,status,details) VALUES(?,?,?,?,?,?)',
   [user?.user_id||null,type,source_ip,new URL(req.url,'http://local').pathname,status,String(description).slice(0,500)]);
 }catch(err){console.error('Activity write failed:',err.message);}
 return record({event_type:type,username:user?.email||'anonymous',source_ip,target_page:new URL(req.url,'http://local').pathname,severity,description,outcome:status});
}
function mutationAllowed(req,session){return config.lab || req.headers['x-csrf-token']===session.csrf;}
function needAuth(res,user){if(user)return true;bad(res,'Please sign in first',401);return false;}
function canView(user,file,share){return user.role==='admin'||Number(file.user_id)===Number(user.user_id)||Boolean(share);}
function isAdmin(user){return user.role==='admin';}
async function shareFor(userId,fileId){return db.one('SELECT * FROM file_shares WHERE file_id=? AND shared_with=?',[fileId,userId]);}
function fileResult(row,owner,shared){return {
  ...row, file_id:Number(row.file_id), user_id:Number(row.user_id), folder_id:row.folder_id?Number(row.folder_id):null,
  file_size:Number(row.file_size), is_trashed:!!row.is_trashed,
  owner_name:owner?.full_name||'', shared:!!shared, share_permission:shared&&typeof shared==='object'?shared.permission:null
};}
async function lookupFile(user,id,{allowLabIdor=false}={}){
 const file=await db.one('SELECT * FROM files WHERE file_id=?',[id]);
 if(!file || (file.is_trashed && Number(file.user_id)!==Number(user.user_id))) return null;
 const share=await shareFor(user.user_id,id);
 if(!canView(user,file,share) && !(config.lab&&allowLabIdor)) return null;
 return {file,share,wasUnauthorized:!canView(user,file,share)};
}
async function listFiles(user,scope,q=''){
 let files=await db.all('SELECT * FROM files ORDER BY file_id DESC');
 const shares=await db.all('SELECT * FROM file_shares WHERE shared_with=?',[user.user_id]);
 const ids=new Set(shares.map(s=>Number(s.file_id)));
 files=files.filter(f=>{
  const own=Number(f.user_id)===Number(user.user_id), shared=ids.has(Number(f.file_id));
  if(scope==='shared')return shared && !f.is_trashed;
  if(scope==='trash')return own && !!f.is_trashed;
  if(scope==='recent')return (own||shared)&&!f.is_trashed;
  return own && !f.is_trashed;
 }).filter(f=>f.file_name.toLowerCase().includes(q.toLowerCase()));
 if(scope==='recent')files=files.slice(0,7);
 const users=await db.all('SELECT user_id, full_name FROM users');
 return files.map(f=>fileResult(f,users.find(u=>Number(u.user_id)===Number(f.user_id)),ids.has(Number(f.file_id))));
}

// Always refuse to serve hidden config or any files outside public/.
function serveStatic(req,res,pathName){
 let rel=pathName==='/'?'index.html':pathName.replace(/^\//,'');
 const full=path.resolve(publicDir,rel);
 if(!(full===publicDir || full.startsWith(publicDir+path.sep)))return bad(res,'Not found',404);
 if(!fs.existsSync(full)||!fs.statSync(full).isFile())return bad(res,'Not found',404);
 const ext=path.extname(full).toLowerCase();
 const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
 res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',
  'Cache-Control':'no-cache', ...(config.lab?{}:{'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'"})});
 fs.createReadStream(full).pipe(res);
}
// File bytes live in local storage or a private S3 bucket; SQL stores metadata.
// S3 access uses the EC2 instance IAM role, NEVER embedded access keys.
const saveUpload=storage.save;
const readFileContent=storage.read;

async function handler(req,res){
 const url=new URL(req.url,`http://127.0.0.1:${config.port}`),route=url.pathname;
 const method=req.method;
 if(!route.startsWith('/api/'))return serveStatic(req,res,route);
 if(route==='/api/status' && method==='GET')return send(res,200,{name:'CloudVault',status:'running',mode:config.lab?'private-lab':'normal',database:config.mysql?'MySQL':'SQLite',storage:config.storage});
 if(route==='/api/health'&&method==='GET')return send(res,200,{status:'ok',name:'CloudVault',api:'running'});
 if(route==='/api/config'&&method==='GET')return send(res,200,{lab:config.lab,storage:config.storage,database:config.mysql?'MySQL':'SQLite'});
 const {user,session}=await currentUser(req);
 const source=ip(req);

 // === USER ACCOUNTS ===
 if(route==='/api/auth/register'&&method==='POST'){
  const b=await readJson(req);
  const name=String(b.full_name||'').trim().slice(0,100),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');
  const username=String(b.username||email.split('@')[0]).trim();
  if(name.length<2||!/^\S+@\S+\.\S+$/.test(email)||password.length<8||! /^[A-Za-z0-9._-]{3,32}$/.test(username))return bad(res,'Enter a name, valid email, and password of at least 8 characters');
  if(await db.one('SELECT user_id FROM users WHERE email=? OR LOWER(username)=?',[email,username.toLowerCase()]))return bad(res,'Email or username already registered',409);
  const result=await db.run('INSERT INTO users(full_name,username,email,password_hash,role,storage_limit) VALUES(?,?,?,?,?,?)',[name,username,email,db.hashPassword(password),'user',104857600]);
  const account=await db.one('SELECT * FROM users WHERE user_id=?',[result.id]);
  const s=newSession(res,result.id);
  await audit(req,account,'registration','New user registered');
  return send(res,201,{status:'success',user:publicUser(account),csrf:s.csrf});
 }
 if(route==='/api/auth/login'&&method==='POST'){
  const b=await readJson(req);
  const identity=String(b.email||'').toLowerCase().trim(),password=String(b.password||'');
  // Login accepts either an email address or an account username (e.g. John123).
  const account=await db.one('SELECT * FROM users WHERE email=? OR LOWER(username)=?',[identity,identity]);
  const email=account?.email||identity;
  if(!config.lab){
    const recent=await db.all('SELECT * FROM login_attempts WHERE email=? ORDER BY attempt_id DESC LIMIT 10',[email]);
    const cutoff=Date.now()-5*60*1000;
    const when=x=>x instanceof Date?x.getTime():new Date(String(x).replace(' ','T').replace(/Z?$/,'Z')).getTime();
    if(recent.filter(x=>!x.success && when(x.attempted_at)>cutoff).length>=5){
      await audit(req,account,'login_rate_limited','More than five recent failures','blocked','medium');
      return bad(res,'Too many failed logins. Try again later.',429);
    }
  }
  const success=!!(account && db.verifyPassword(password,account.password_hash));
  await db.run('INSERT INTO login_attempts(email,ip_address,success) VALUES(?,?,?)',[email,source,success?1:0]);
  await audit(req,account,success?'login_success':'login_failed',success?'User authenticated':'Invalid account credentials',success?'success':'failed',success?'low':'medium');
  if(!success)return bad(res,'Incorrect email or password',401);
  const s=newSession(res,account.user_id);
  return send(res,200,{status:'success',user:publicUser(account),csrf:s.csrf});
 }
 if(route==='/api/auth/logout'&&method==='POST'){
  sessions.delete(cookies(req).cv_session);
  res.setHeader('Set-Cookie',`cv_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${config.cookieSecure?'; Secure':''}`);
  return send(res,200,{status:'success'});
 }
 if(route==='/api/auth/forgot'&&method==='POST'){
  const b=await readJson(req),email=String(b.email||'').toLowerCase().trim();
  const account=await db.one('SELECT * FROM users WHERE email=?',[email]);
  // A real account must receive the recovery code; never pretend it was emailed.
  if(!config.lab && (!process.env.SMTP_HOST || !process.env.SMTP_FROM))
    return bad(res,'Email recovery is not configured. Contact the administrator.',503);
  let preview=null;
  if(account){
   const code=config.lab?'123456':crypto.randomBytes(16).toString('hex');
   const codeHash=crypto.createHash('sha256').update(code).digest('hex');
   if(!config.lab){
     // Send BEFORE writing a valid reset token, so mail failure cannot create an inaccessible reset.
     try{await sendResetEmail(email,code);}catch(err){console.error('Password recovery email failed:',err.message);return bad(res,'Could not deliver recovery email',503);}
   }
   await db.run('INSERT INTO password_reset_requests(user_id,token_hash,expires_at) VALUES(?,?,?)',
    [account.user_id,codeHash,new Date(Date.now()+15*60*1000).toISOString().slice(0,19).replace('T',' ')]);
   await audit(req,account,'password_reset_requested','Recovery request','success','medium');
   if(config.lab)preview=code; // Deliberately predictable ONLY in private lab.
  }
  return send(res,200,{status:'success',message:'If the account exists, recovery instructions were sent.', ...(preview?{lab_demo_code:preview}:{})});
 }
 if(route==='/api/auth/reset'&&method==='POST'){
  const b=await readJson(req),email=String(b.email||'').toLowerCase().trim(),code=String(b.code||''),pw=String(b.password||'');
  if(pw.length<8)return bad(res,'Password must be at least 8 characters');
  const account=await db.one('SELECT * FROM users WHERE email=?',[email]);
  const latest=account?await db.one('SELECT * FROM password_reset_requests WHERE user_id=? AND used=0 ORDER BY reset_id DESC LIMIT 1',[account.user_id]):null;
  const codeHash=crypto.createHash('sha256').update(code).digest('hex');
  const valid=latest && latest.token_hash===codeHash && new Date(String(latest.expires_at).replace(' ','T')+'Z').getTime()>Date.now();
  await audit(req,account,valid?'password_reset_success':'password_reset_failed',valid?'Password changed':'Invalid recovery code',valid?'success':'failed','medium');
  if(!valid)return bad(res,'Invalid or expired recovery code',400);
  await db.run('UPDATE users SET password_hash=? WHERE user_id=?',[db.hashPassword(pw),account.user_id]);
  await db.run('UPDATE password_reset_requests SET used=1 WHERE user_id=?',[account.user_id]);
  for (const [sid,item] of sessions) if(item.userId===account.user_id) sessions.delete(sid);
  return send(res,200,{status:'success',message:'Password updated. Please sign in.'});
 }
 if(route==='/api/me' && method==='GET'){
  if(!needAuth(res,user))return;
  return send(res,200,{user:publicUser(user),csrf:session.csrf,lab:config.lab});
 }
 if(!needAuth(res,user))return;
 if(method!=='GET'&&!mutationAllowed(req,session))return bad(res,'Missing CSRF protection token',403);

 // User-visible account history (not a security analytics/monitoring dashboard).
 // The user's own events only; the Wazuh agent independently receives security logs.
 if(route==='/api/activity' && method==='GET'){
   const rows=await db.all('SELECT event_type, status, details, created_at FROM activity_logs WHERE user_id=? ORDER BY activity_id DESC LIMIT 40',[user.user_id]);
   return send(res,200,{status:'success',data:rows});
 }
 if(route==='/api/profile' && method==='PATCH'){
  const b=await readJson(req);
  const name=String(b.full_name||'').trim().slice(0,100);
  if(name.length<2)return bad(res,'Name is too short');
  await db.run('UPDATE users SET full_name=? WHERE user_id=?',[name,user.user_id]);
  await audit(req,user,'profile_updated','User changed account name');
  return send(res,200,{status:'success'});
 }
 if(route==='/api/profile/password' && method==='POST'){
  const b=await readJson(req);
  if(!db.verifyPassword(String(b.current_password||''),user.password_hash))return bad(res,'Current password is incorrect',403);
  const newPassword=String(b.new_password||'');
  if(newPassword.length<8)return bad(res,'New password must have at least 8 characters');
  await db.run('UPDATE users SET password_hash=? WHERE user_id=?',[db.hashPassword(newPassword),user.user_id]);
  // Changing credentials invalidates other active sessions immediately.
  const currentId=cookies(req).cv_session;
  for(const [key,entry] of sessions)if(entry.userId===user.user_id && key!==currentId)sessions.delete(key);
  await audit(req,user,'password_changed','Account password changed');
  return send(res,200,{status:'success'});
 }
 // === DASHBOARD & FOLDERS ===
 if(route==='/api/dashboard'&&method==='GET'){
  const files=await listFiles(user,'mine'),recent=await listFiles(user,'recent');
  const stored=await db.all('SELECT file_size FROM files WHERE user_id=?',[user.user_id]);
  const folders=await db.all('SELECT * FROM folders WHERE user_id=? ORDER BY folder_id DESC',[user.user_id]);
  return send(res,200,{status:'success',stats:{total_files:files.length,folders:folders.length,used_bytes:stored.reduce((a,f)=>a+Number(f.file_size),0),shared_with_me:(await listFiles(user,'shared')).length,limit_bytes:Number(user.storage_limit)},recent,folders});
 }
 if(route==='/api/folders'&&method==='GET'){
  return send(res,200,{status:'success',data:await db.all('SELECT * FROM folders WHERE user_id=? ORDER BY folder_id DESC',[user.user_id])});
 }
 if(route==='/api/folders'&&method==='POST'){
  const b=await readJson(req),name=String(b.folder_name||'').trim().slice(0,100);
  if(!name)return bad(res,'Folder name is required');
  const result=await db.run('INSERT INTO folders(user_id,folder_name) VALUES(?,?)',[user.user_id,name]);
  await audit(req,user,'folder_created',`Folder #${result.id} created`);
  return send(res,201,{status:'success',folder_id:result.id});
 }

 // === FOLDER MANAGEMENT ===
 // Renaming a folder updates metadata; deleting it moves files back to My Drive.
 const folderMatch=route.match(/^\/api\/folders\/(\d+)$/);
 if(folderMatch && (method==='PATCH'||method==='DELETE')){
  const fid=number(folderMatch[1]);
  const folder=await db.one('SELECT * FROM folders WHERE folder_id=? AND user_id=?',[fid,user.user_id]);
  if(!folder)return bad(res,'Folder not found',404);
  if(method==='PATCH'){
   const b=await readJson(req),name=String(b.folder_name||'').trim().slice(0,100);
   if(!name)return bad(res,'Folder name is required');
   await db.run('UPDATE folders SET folder_name=? WHERE folder_id=?',[name,fid]);
   await audit(req,user,'folder_renamed',`Renamed folder #${fid}`);
   return send(res,200,{status:'success'});
  }
  await db.run('UPDATE files SET folder_id=NULL WHERE folder_id=? AND user_id=?',[fid,user.user_id]);
  await db.run('UPDATE folders SET parent_id=NULL WHERE parent_id=? AND user_id=?',[fid,user.user_id]);
  await db.run('DELETE FROM folders WHERE folder_id=? AND user_id=?',[fid,user.user_id]);
  await audit(req,user,'folder_deleted',`Deleted folder #${fid}; its files remain in My Drive`);
  return send(res,200,{status:'success'});
 }

 // === FILE SEARCH: REAL SQL INJECTION ONLY IN PRIVATE LAB CONFIGURATION ===
 if(route==='/api/search'&&method==='GET'){
  const q=String(url.searchParams.get('q')||'').slice(0,120);
  let rows;
  if(config.lab){
   // LAB VULNERABILITY: user input is joined directly to SQL.
   // This always targets a disposable lab database, NEVER real S3.
   const sql=`SELECT * FROM files WHERE file_name LIKE '%${q}%' AND user_id = ${Number(user.user_id)} AND is_trashed = 0`;
   try{rows=await db.all(sql);}catch(err){
    await audit(req,user,'search_sql_error','Unsafe query caused a database error','failed','high');
    return bad(res,'Search could not complete in the test database',400);
   }
  }else{
   rows=await db.all('SELECT * FROM files WHERE user_id=? AND is_trashed=0 AND (file_name LIKE ? OR description LIKE ?) ORDER BY file_id DESC',
    [user.user_id,`%${q}%`,`%${q}%`]);
  }
  if(/[;'"\-]|\b(OR|UNION|SELECT)\b/i.test(q))await audit(req,user,'suspicious_search','Potential SQL injection pattern in file search','observed','high');
  const users=await db.all('SELECT user_id,full_name FROM users');
  return send(res,200,{status:'success',data:rows.map(f=>fileResult(f,users.find(u=>u.user_id===f.user_id),false))});
 }
 if(route==='/api/files'&&method==='GET'){
  const scope=url.searchParams.get('scope')||'mine';
  return send(res,200,{status:'success',data:await listFiles(user,scope)});
 }
 if(route==='/api/files/upload'&&method==='POST'){
  const b=await readJson(req,15*1024*1024),name=safeFilename(b.file_name||'file');
  let mime=String(b.file_type||'application/octet-stream').slice(0,150);
  if(typeof b.base64!=='string'||b.base64.length>14*1024*1024)return bad(res,'Select a file smaller than 10 MB');
  const buf=Buffer.from(b.base64,'base64');
  if(!buf.length||buf.length>limit)return bad(res,'File is empty or exceeds the 10 MB limit');
  if(!config.lab){
   const lower=name.toLowerCase();
   const allowed=['.txt','.pdf','.png','.jpg','.jpeg','.docx'];
   if(!allowed.some(ext=>lower.endsWith(ext)))return bad(res,'Unsupported file type');
   if(lower.endsWith('.png')&&!buf.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return bad(res,'Invalid PNG content');
   if((lower.endsWith('.jpg')||lower.endsWith('.jpeg'))&&!buf.subarray(0,3).equals(Buffer.from('ffd8ff','hex')))return bad(res,'Invalid JPEG content');
   if(lower.endsWith('.pdf')&&!buf.subarray(0,5).equals(Buffer.from('%PDF-')))return bad(res,'Invalid PDF content');
   if(lower.endsWith('.docx')&&!buf.subarray(0,2).equals(Buffer.from('PK')))return bad(res,'Invalid DOCX content');
   if(lower.endsWith('.txt') && buf.includes(0))return bad(res,'Invalid text file');
   // Store only a trusted MIME type derived from the validated filename.
   mime=lower.endsWith('.pdf')?'application/pdf':lower.endsWith('.png')?'image/png':/\.jpe?g$/.test(lower)?'image/jpeg':lower.endsWith('.docx')?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'text/plain; charset=utf-8';
  } else {
   const ext=path.extname(name).toLowerCase();
   const validJpeg=buf.subarray(0,3).equals(Buffer.from('ffd8ff','hex'));
   const validPng=buf.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
   if((['.jpg','.jpeg'].includes(ext)&&!validJpeg)||(ext==='.png'&&!validPng)){
    await audit(req,user,'suspicious_upload',`Lab uploader accepted an image extension with invalid file signature: ${ext}`,'accepted','medium');
   }
  }
  const allOwn=await db.all('SELECT file_size FROM files WHERE user_id=?',[user.user_id]);
  if(allOwn.reduce((s,f)=>s+Number(f.file_size),0)+buf.length>Number(user.storage_limit))return bad(res,'Storage limit reached',413);
  const folder=number(b.folder_id);
  if(folder && !await db.one('SELECT * FROM folders WHERE folder_id=? AND user_id=?',[folder,user.user_id]))return bad(res,'Invalid folder');
  const saved=await saveUpload(buf,mime,user.user_id);
  let result;
  try{result=await db.run('INSERT INTO files(user_id,folder_id,file_name,file_type,file_size,s3_key,local_path,description) VALUES(?,?,?,?,?,?,?,?)',
   [user.user_id,folder,name,mime,buf.length,saved.s3_key,saved.local_path,String(b.description||'').slice(0,500)]);}
  catch(err){await storage.remove(saved).catch(()=>{});throw err;}
  await audit(req,user,'file_uploaded',`Uploaded ${name}, id=${result.id}`);
  return send(res,201,{status:'success',file_id:result.id});
 }
 // === LAB CSRF: top-level GET changes sharing permissions using cookie ===
 if(route==='/api/lab/share'&&method==='GET'){
  if(!config.lab)return bad(res,'Not found',404);
  const fid=number(url.searchParams.get('file_id'));
  const target=String(url.searchParams.get('email')||'').toLowerCase();
  const f=fid?await db.one('SELECT * FROM files WHERE file_id=? AND user_id=?',[fid,user.user_id]):null;
  const receiver=await db.one('SELECT user_id FROM users WHERE email=?',[target]);
  if(!f||!receiver||receiver.user_id===user.user_id)return bad(res,'File or recipient unavailable',400);
  if(!await db.one('SELECT * FROM file_shares WHERE file_id=? AND shared_with=?',[fid,receiver.user_id])){
   await db.run('INSERT INTO file_shares(file_id,shared_by,shared_with,permission) VALUES(?,?,?,?)',[fid,user.user_id,receiver.user_id,'view']);
  }
  await audit(req,user,'csrf_share_change','Lab-only state-changing GET shared a dummy file','accepted','high');
  // ordinary top-level navigation can trigger the state change in lab
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  return res.end('<!doctype html><title>Share updated</title><p>Lab sharing request accepted. Return to CloudVault to check Shared Files.</p>');
 }
 // === FILE ROUTES ===
 const fileMatch=route.match(/^\/api\/files\/(\d+)(?:\/(comments|share|download|preview))?$/);
 if(fileMatch){
  const fid=number(fileMatch[1]),action=fileMatch[2]||'';
  const details=await lookupFile(user,fid,{allowLabIdor:method==='GET'&&(action===''||action==='download'||action==='preview')});
  if(!details){await audit(req,user,'file_access_denied',`File #${fid} not accessible`,'blocked','medium');return bad(res,'File not found or access denied',404);}
  const {file,wasUnauthorized}=details;
  const owner=Number(file.user_id)===Number(user.user_id);
  const canEdit=owner || details.share?.permission==='edit';
  if(wasUnauthorized){await audit(req,user,'cross_owner_file_access',`Lab IDOR: accessed dummy file #${fid} owned by user #${file.user_id}`,'accepted','high');}
  if(!action&&method==='GET'){
   const owner=await db.one('SELECT user_id,full_name,email FROM users WHERE user_id=?',[file.user_id]);
   return send(res,200,{status:'success',file:fileResult(file,owner,details.share)});
  }
  if(!action&&method==='PATCH'){
   if(!canEdit)return bad(res,'Editing permission required',403);
   const b=await readJson(req);
   // Shared editors can update names/descriptions, but cannot move or delete the owner's files.
   if(!owner && (b.is_trashed!==undefined || b.folder_id!==undefined))return bad(res,'Only the owner can move or delete this file',403);
   const updates=[];const values=[];
   if(b.file_name!==undefined){updates.push('file_name=?');values.push(safeFilename(b.file_name));}
   if(b.description!==undefined){updates.push('description=?');values.push(String(b.description).slice(0,500));}
   if(b.is_trashed!==undefined){updates.push('is_trashed=?');values.push(b.is_trashed?1:0);}
   if(b.folder_id!==undefined){
    const folder=b.folder_id?number(b.folder_id):null;
    if(folder&&!await db.one('SELECT * FROM folders WHERE folder_id=? AND user_id=?',[folder,user.user_id]))return bad(res,'Folder does not belong to you');
    updates.push('folder_id=?');values.push(folder);
   }
   if(!updates.length)return bad(res,'No changes provided');
   await db.run(`UPDATE files SET ${updates.join(',')} WHERE file_id=?`,[...values,fid]);
   await audit(req,user,b.is_trashed?'file_trashed':'file_updated',`Updated file #${fid}`);
   return send(res,200,{status:'success'});
  }
  if(!action&&method==='DELETE'){
   if(!owner)return bad(res,'Only the owner can permanently delete a file',403);
   if(!file.is_trashed)return bad(res,'Move the file to Trash before permanent deletion',400);
   // S3 object and database are different systems. Delete the bytes first;
   // if S3 fails, leave the metadata so the owner can safely retry.
   await storage.remove(file);
   await db.run('DELETE FROM file_comments WHERE file_id=?',[fid]);
   await db.run('DELETE FROM file_shares WHERE file_id=?',[fid]);
   await db.run('DELETE FROM files WHERE file_id=? AND user_id=?',[fid,user.user_id]);
   await audit(req,user,'file_permanently_deleted',`Permanently deleted file #${fid}`,'success','medium');
   return send(res,200,{status:'success'});
  }
  if(action==='comments'&&method==='GET'){
   const rows=await db.all('SELECT * FROM file_comments WHERE file_id=? ORDER BY comment_id DESC',[fid]);
   const users=await db.all('SELECT user_id,full_name FROM users');
   return send(res,200,{status:'success',data:rows.map(r=>({...r,author:users.find(x=>x.user_id===r.user_id)?.full_name||'User'}))});
  }
  if(action==='comments'&&method==='POST'){
   const b=await readJson(req),text=String(b.comment_text||'').slice(0,1000).trim();
   if(!text)return bad(res,'Comment is empty');
   await db.run('INSERT INTO file_comments(file_id,user_id,comment_text) VALUES(?,?,?)',[fid,user.user_id,text]);
   if(/<script|onerror\s*=|onload\s*=|javascript:/i.test(text))await audit(req,user,'suspicious_comment','Possible stored XSS in comment','accepted','high');
   else await audit(req,user,'comment_added',`Comment added to file #${fid}`);
   return send(res,201,{status:'success'});
  }
  if(action==='share'&&method==='GET'){
   if(!owner)return bad(res,'Only the owner can view recipients',403);
   const shares=await db.all('SELECT * FROM file_shares WHERE file_id=?',[fid]);
   const users=await db.all('SELECT user_id,full_name,email FROM users');
   return send(res,200,{status:'success',data:shares.map(x=>({...x,recipient:users.find(u=>Number(u.user_id)===Number(x.shared_with))||null}))});
  }
  if(action==='share'&&method==='DELETE'){
   if(!owner)return bad(res,'Only the owner can revoke access',403);
   const b=await readJson(req),target=String(b.email||'').trim().toLowerCase();
   const receiver=await db.one('SELECT user_id FROM users WHERE email=?',[target]);
   if(!receiver)return bad(res,'User not found',404);
   await db.run('DELETE FROM file_shares WHERE file_id=? AND shared_with=?',[fid,receiver.user_id]);
   await audit(req,user,'file_unshared',`Removed shared access to file #${fid}`);
   return send(res,200,{status:'success'});
  }
  if(action==='share'&&method==='POST'){
   if(Number(file.user_id)!==Number(user.user_id))return bad(res,'Only owner can share',403);
   const b=await readJson(req),email=String(b.email||'').trim().toLowerCase();
   const receiver=await db.one('SELECT user_id FROM users WHERE email=?',[email]);
   if(!receiver||receiver.user_id===user.user_id)return bad(res,'Enter another registered user email');
   const permission=b.permission==='edit'?'edit':'view';
   const exists=await db.one('SELECT * FROM file_shares WHERE file_id=? AND shared_with=?',[fid,receiver.user_id]);
   if(exists)await db.run('UPDATE file_shares SET permission=? WHERE share_id=?',[permission,exists.share_id]);
   else await db.run('INSERT INTO file_shares(file_id,shared_by,shared_with,permission) VALUES(?,?,?,?)',[fid,user.user_id,receiver.user_id,permission]);
   await audit(req,user,'file_shared',`File #${fid} shared with ${email}`);
   return send(res,200,{status:'success'});
  }
  if((action==='download'||action==='preview')&&method==='GET'){
   const buffer=await readFileContent(file);
   const labPreview=config.lab&&action==='preview'&&/\.html?$/i.test(file.file_name);
   const type=labPreview?'text/html; charset=utf-8':(action==='preview' && /^(image\/(png|jpeg)|application\/pdf|text\/plain)/.test(file.file_type||''))?file.file_type:'application/octet-stream';
   if(labPreview)await audit(req,user,'unsafe_preview_activity',`Lab preview rendered active dummy HTML: file ${fid}`,'accepted','medium');
   else await audit(req,user,action==='preview'?'file_previewed':'file_downloaded',`File #${fid}`);
   const disposition=action==='download'?'attachment':'inline';
   res.writeHead(200,{'Content-Type':type,'Content-Length':buffer.length,'Content-Disposition':`${disposition}; filename="${safeFilename(file.file_name).replace(/"/g,'')}"`,'X-Content-Type-Options':labPreview?'':'nosniff', ...(config.lab?{}:{'Content-Security-Policy':"default-src 'none'; sandbox"})});
   return res.end(buffer);
  }
 }
 if(route==='/api/lab/download'&&method==='GET'){
  if(!config.lab)return bad(res,'Not found',404);
  const relative=String(url.searchParams.get('path')||'').slice(0,200);
  const target=path.resolve(uploads,relative);
  // The intentionally missing upload-directory check is CONFINED to harmless
  // lab fixtures under data/, never source files, OS secrets, or AWS credentials.
  const fixtureRoot=path.join(config.dataDir,'lab-fixtures');
  if(!(target.startsWith(uploads+path.sep)||target.startsWith(fixtureRoot+path.sep)))return bad(res,'Outside lab fixture boundary',403);
  if(!fs.existsSync(target)||!fs.statSync(target).isFile())return bad(res,'Dummy file not found',404);
  await audit(req,user,'path_traversal_test',`Lab download path crossed normal upload directory`,'accepted','high');
  res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});
  return res.end(fs.readFileSync(target));
 }
 // === ADMINISTRATIVE ACCOUNT ROLES (NOT A MONITORING DASHBOARD) ===
 if(route==='/api/admin/users'&&method==='GET'){
  if(!isAdmin(user))return bad(res,'Administrator access required',403);
  const rows=await db.all('SELECT user_id,full_name,username,email,role,storage_limit,created_at FROM users ORDER BY user_id');
  return send(res,200,{status:'success',data:rows});
 }
 if(route==='/api/admin/role'&&method==='POST'){
  if(!isAdmin(user))return bad(res,'Administrator access required',403);
  const b=await readJson(req),uid=number(b.user_id),role=String(b.role||'');
  if(!uid||!['user','premium','admin'].includes(role)||uid===user.user_id)return bad(res,'Choose another user and a valid role');
  const newLimit=role==='user'?104857600:536870912;
  await db.run('UPDATE users SET role=?,storage_limit=? WHERE user_id=?',[role,newLimit,uid]);
  await audit(req,user,'user_role_updated',`Role for user #${uid} changed to ${role}`);
  return send(res,200,{status:'success'});
 }
 return bad(res,'Endpoint not found',404);
}
function startWebsite(){
 const server=http.createServer((req,res)=>{
  handler(req,res).catch(err=>{
   console.error(`[CloudVault] ${req.method} ${req.url}:`,err.message);
   if(!res.headersSent)bad(res,'Server error: '+(config.lab?err.message:'Please try again'),Number.isInteger(err.code)?err.code:500);
  });
 });
 server.listen(config.port,config.host,()=>console.log(`CloudVault website: http://${config.host}:${config.port}`));
 return server;
}
module.exports={startWebsite};
