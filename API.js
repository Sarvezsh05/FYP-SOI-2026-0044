/**
 * Integrated version of the user's uploaded API.js.
 * SAME HTTP contracts on port 8000:
 * GET /api/health
 * POST /api/events     x-api-key + event_type/source_ip/severity
 * GET /api/events      x-api-key
 * GET /api/summary     x-api-key
 * GET /api/query-cloudvault   x-api-key
 *
 * This API preserves the same endpoint contract as the uploaded API.js.
 * This version needs NO Express, CORS, dotenv, axios or mysql2 in local mode.
 * It stores events in the same database and Wazuh-compatible JSON log as CloudVault.
 * The API key is never placed in browser JavaScript.
 */
const http=require('http');
const config=require('./config');
const db=require('./db');
const {record}=require('./events');
const {send,bad,readJson}=require('./helpers');
async function apiHandler(req,res) {
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/health' && req.method==='GET'){
   return send(res,200,{status:'success',message:'API.js Server is running!',database_mode:config.mysql?'MySQL':'Local SQLite'});
 }
 if(req.headers['x-api-key']!==config.apiKey) return bad(res,'Unauthorized: Invalid or missing x-api-key header',401);
 if(url.pathname==='/api/events' && req.method==='POST') {
   const data=await readJson(req);
   if(!data.event_type||!data.source_ip||!data.severity) return bad(res,'Missing required fields: event_type, source_ip, and severity are required.');
   if(!['low','medium','high'].includes(String(data.severity).toLowerCase()))return bad(res,'Severity must be low, medium, or high');
   const event=await record({...data,severity:String(data.severity).toLowerCase()});
   return send(res,201,{status:'success',message:'Security event saved',data:event});
 }
 if(url.pathname==='/api/events' && req.method==='GET'){
   const rows=await db.all('SELECT * FROM security_events ORDER BY event_id DESC LIMIT 200');
   return send(res,200,{status:'success',count:rows.length,data:rows});
 }
 if(url.pathname==='/api/summary' && req.method==='GET'){
   const rows=await db.all('SELECT severity FROM security_events');
   return send(res,200,{status:'success',summary:{total_events:rows.length,high_severity:rows.filter(x=>x.severity==='high').length,medium_severity:rows.filter(x=>x.severity==='medium').length,low_severity:rows.filter(x=>x.severity==='low').length}});
 }
 if(url.pathname==='/api/query-cloudvault' && req.method==='GET'){
   try {
     const response=await fetch(`http://127.0.0.1:${config.port}/api/status`,{signal:AbortSignal.timeout(5000)});
     return send(res,200,{status:'success',message:'Successfully queried CloudVault website from API server',cloudvault_data:await response.json()});
   } catch(err) {return send(res,502,{status:'error',message:'Failed to reach CloudVault website',details:err.message});}
 }
 return bad(res,'API endpoint not found',404);
}
function startApi(){
 const server=http.createServer((req,res)=>{
  apiHandler(req,res).catch(err=>{console.error('API error:',err.message);if(!res.headersSent)bad(res,'Internal API error',500);});
 });
 // Sensitive API is loopback-only, so the uploaded API key is not leaked to public users.
 server.listen(config.apiPort,'127.0.0.1',()=>console.log(`FYP security event API: http://127.0.0.1:${config.apiPort}/api/health`));
 return server;
}
if(require.main===module){db.init().then(startApi).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={startApi};
