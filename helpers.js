const crypto=require('crypto');
const {URL}=require('url');
function send(res,status,payload,headers={}) {
 if (res.writableEnded) return;
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});
 res.end(JSON.stringify(payload));
}
function bad(res,message,status=400){ send(res,status,{status:'error',message}); }
function readJson(req,limit=5*1024*1024) {
 return new Promise((resolve,reject)=>{
  let total=0; const pieces=[];
  req.on('data',buf=>{
    total+=buf.length;
    if(total>limit){reject(Object.assign(new Error('Request too large'),{code:413}));req.destroy();return;}
    pieces.push(buf);
  });
  req.on('end',()=>{
   try {const raw=Buffer.concat(pieces).toString('utf8');resolve(raw?JSON.parse(raw):{});}catch{reject(Object.assign(new Error('Invalid JSON'),{code:400}));}
  });
  req.on('error',reject);
 });
}
function cookies(req) {
 return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=').map(decodeURIComponent)).filter(x=>x.length===2));
}
function token(){return crypto.randomBytes(24).toString('hex');}
function publicUser(user){if(!user)return null;return {user_id:user.user_id,full_name:user.full_name,username:user.username||null,email:user.email,role:user.role,storage_limit:Number(user.storage_limit)};}
function number(v){const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:null;}
function safeFilename(name){return String(name||'file').replace(/[\\/\x00-\x1f]/g,'_').slice(0,180);}
function ip(req){return (req.socket.remoteAddress||'127.0.0.1').replace(/^::ffff:/,'');}
module.exports={send,bad,readJson,cookies,token,publicUser,number,safeFilename,ip};
