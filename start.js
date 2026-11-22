// One command runs the CloudVault website AND the uploaded event API integration.
const config=require('./config');
const db=require('./db');
const {startWebsite}=require('./server');
const {startApi}=require('./API');
async function main(){
 await db.init();
 const site=startWebsite();
 const api=startApi();
 console.log('\nCloudVault is ONE website. API.js is a private backend service, not a second website.');
 console.log(`Mode: ${config.lab?'PRIVATE VULNERABLE LAB':'NORMAL / PROTECTED'} | Database: ${config.mysql?'MySQL':'SQLite'} | Storage: ${config.storage}`);
 console.log('To stop both servers press Ctrl+C.');
 process.on('SIGINT',()=>{site.close();api.close();process.exit(0)});
}
if(require.main===module)main().catch(err=>{console.error('\nStartup error:',err.message);process.exit(1)});
module.exports=main;
