// Both CloudVault and the supplied API use this event collector.
// One JSON object per line: suitable for a Wazuh agent's log_format=json.
const fs=require('fs');
const path=require('path');
const db=require('./db');
const config=require('./config');
const file=path.join(process.env.CLOUDVAULT_LOG_DIR || path.join(config.root,'logs'),'cloudvault-events.jsonl');
fs.mkdirSync(path.dirname(file),{recursive:true});
async function record(event={}) {
 const e={
   timestamp:new Date().toISOString(),
   application:'CloudVault',
   event_type:String(event.event_type||'application_event').slice(0,100),
   username:String(event.username||'anonymous').slice(0,150),
   source_ip:String(event.source_ip||'127.0.0.1').slice(0,45),
   target_page:String(event.target_page||'/').slice(0,500),
   severity:['low','medium','high'].includes(event.severity)?event.severity:'low',
   description:String(event.description||'').slice(0,600),
   outcome:String(event.outcome||'observed').slice(0,30)
 };
 // NEVER write passwords, tokens, cookies or file contents to logs.
 fs.appendFileSync(file,JSON.stringify(e)+'\n');
 try {
  await db.run('INSERT INTO security_events(event_type,username,source_ip,target_page,severity,description,timestamp) VALUES(?,?,?,?,?,?,?)',
   [e.event_type,e.username,e.source_ip,e.target_page,e.severity,e.description,e.timestamp.replace('T',' ').replace('Z','')]);
 } catch(err) { console.error('Event DB write failed:',err.message); }
 return e;
}
function logPath() {return file;}
module.exports={record,logPath};
