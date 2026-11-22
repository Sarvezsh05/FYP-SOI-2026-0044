const fs = require('fs');
const path = require('path');
const config = require('./config');
const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');
}
function verifyPassword(password, stored) {
  try {
    const [salt, expected] = stored.split(':');
    const actual = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(actual, Buffer.from(expected,'hex'));
  } catch { return false; }
}

let pool = null;
let sqlite = null;
async function init() {
  if (config.mysql) {
    let mysql;
    try { mysql = require('mysql2/promise'); }
    catch { throw new Error('MySQL mode needs mysql2. Run npm.cmd install mysql2 first.'); }
    pool = mysql.createPool({
      host:process.env.DB_HOST || '127.0.0.1',
      port:Number(process.env.DB_PORT || 3306),
      user:process.env.DB_USER || 'cloudvault',
      password:process.env.DB_PASSWORD || '',
      database:process.env.DB_NAME || 'cloudvault_db',
      // Hosted databases: use TLS and validate the server certificate.
      ...(process.env.DB_SSL === 'true' ? {ssl:{rejectUnauthorized:true}} : {}),
      connectTimeout:12000,
      waitForConnections:true, connectionLimit:5
    });
    await pool.query('SELECT 1');
    const [tables] = await pool.query("SHOW TABLES LIKE 'users'");
    if (!tables.length) throw new Error('MySQL tables missing. Run db/cloudvault_mysql.sql (or db/cloudvault_filess_tables.sql) first.');
    const [usernames]=await pool.query("SHOW COLUMNS FROM users LIKE 'username'");
    if(!usernames.length) {
      await pool.query('ALTER TABLE users ADD COLUMN username VARCHAR(40) NULL');
      await pool.query('CREATE UNIQUE INDEX idx_users_username ON users(username)');
    }
  } else {
    let DatabaseSync;
    try { ({DatabaseSync} = require('node:sqlite')); }
    catch { throw new Error('Please install Node.js 22 or newer for the no-install SQLite mode.'); }
    sqlite = new DatabaseSync(path.join(config.dataDir,'cloudvault.sqlite'));
    sqlite.exec(fs.readFileSync(path.join(config.root,'db/schema.sqlite.sql'),'utf8'));
    // Existing SQLite installations may predate the username feature.
    const fields=sqlite.prepare('PRAGMA table_info(users)').all();
    if(!fields.some(field=>field.name==='username')) sqlite.exec('ALTER TABLE users ADD COLUMN username TEXT');
    sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)');
  }
  if(config.lab) await seed(); // Only private lab databases receive example users and files.
  else {
    // Fail closed if an old lab database was accidentally reused as a real workspace.
    const demo=await one("SELECT user_id FROM users WHERE email IN ('alice@cloudvault.test','bob@cloudvault.test','admin@cloudvault.test') LIMIT 1");
    if(demo)throw Error('Protected mode detected demo accounts. Back up and use a clean database; do not connect the lab database to real S3.');
    if(fs.existsSync(path.join(config.dataDir,'lab-fixtures','dummy-secret.txt')))
      throw Error('Protected mode cannot reuse the lab data directory. Set CLOUDVAULT_DATA_DIR to a clean private directory.');
  }
}
async function all(sql, params=[]) {
  if (pool) { const [rows] = await pool.execute(sql,params); return rows; }
  return sqlite.prepare(sql).all(...params);
}
async function one(sql,params=[]) { return (await all(sql,params))[0] || null; }
async function run(sql,params=[]) {
  if (pool) { const [result] = await pool.execute(sql,params); return {id:result.insertId,changes:result.affectedRows}; }
  const result=sqlite.prepare(sql).run(...params);
  return {id:Number(result.lastInsertRowid),changes:result.changes};
}
async function seed() {
  const row = await one('SELECT COUNT(*) AS n FROM users');
  if (Number(row.n)>0) return;
  // Dummy users EXIST ONLY in the isolated LAB_MODE=true database.
  // Protected installs start empty and must create their real admin using scripts/create-admin.js.
  await run('INSERT INTO users(full_name,email,password_hash,role,storage_limit,username) VALUES(?,?,?,?,?,?)', ['Alice Tan','alice@cloudvault.test',hashPassword('DemoAlice!123'),'user',104857600,'alice']);
  await run('INSERT INTO users(full_name,email,password_hash,role,storage_limit,username) VALUES(?,?,?,?,?,?)', ['Bob Lim','bob@cloudvault.test',hashPassword('DemoBob!123'),'premium',536870912,'bob']);
  await run('INSERT INTO users(full_name,email,password_hash,role,storage_limit,username) VALUES(?,?,?,?,?,?)', ['CloudVault Admin','admin@cloudvault.test',hashPassword('DemoAdmin!123'),'admin',536870912,'adminlab']);
  const alice=await one('SELECT user_id FROM users WHERE email=?',['alice@cloudvault.test']);
  const bob=await one('SELECT user_id FROM users WHERE email=?',['bob@cloudvault.test']);
  const folderA=await run('INSERT INTO folders(user_id,folder_name) VALUES(?,?)',[alice.user_id,'My Projects']);
  const folderB=await run('INSERT INTO folders(user_id,folder_name) VALUES(?,?)',[bob.user_id,'Private Notes']);
  const fixtures=[
    {owner:alice.user_id,folder:folderA.id,name:'FYP_Project_Outline.txt',content:'CloudVault FYP project\nDummy coursework files for authorized security testing.\n'},
    {owner:alice.user_id,folder:folderA.id,name:'Presentation_Notes.txt',content:'Cloud Security Monitoring and Threat Detection.\nCloudVault is monitored externally using Wazuh.\n'},
    {owner:bob.user_id,folder:folderB.id,name:'Bob_Private_Dummy.txt',content:'PRIVATE DUMMY FILE: Bob is the owner. This file contains no personal information.\n'}
  ];
  fs.mkdirSync(path.join(config.dataDir,'uploads'),{recursive:true});
  for (const f of fixtures) {
    const key='demo-'+crypto.randomBytes(6).toString('hex')+'.txt';
    fs.writeFileSync(path.join(config.dataDir,'uploads',key),f.content);
    await run('INSERT INTO files(user_id,folder_id,file_name,file_type,file_size,local_path,description) VALUES(?,?,?,?,?,?,?)',
      [f.owner,f.folder,f.name,'text/plain',Buffer.byteLength(f.content),key,'Sample dummy file']);
  }
  fs.mkdirSync(path.join(config.dataDir,'lab-fixtures'),{recursive:true});
  fs.writeFileSync(path.join(config.dataDir,'lab-fixtures','dummy-secret.txt'),'This is a harmless prepared path-traversal demonstration file.');
}
module.exports = {init,all,one,run,hashPassword,verifyPassword};
