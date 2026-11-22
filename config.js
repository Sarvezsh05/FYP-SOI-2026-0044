// Small environment-file reader: no additional npm package is required.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = __dirname;
for (const name of ['.env']) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}
const dataDir = path.resolve(process.env.CLOUDVAULT_DATA_DIR || path.join(root,'data'));
fs.mkdirSync(dataDir,{recursive:true});
const configPath = path.join(dataDir, 'local-private-config.json');
let generated = {};
if (fs.existsSync(configPath)) generated = JSON.parse(fs.readFileSync(configPath,'utf8'));
if (!generated.apiKey || !generated.sessionSecret) {
 generated = {apiKey:crypto.randomBytes(28).toString('hex'), sessionSecret:crypto.randomBytes(32).toString('hex')};
 fs.writeFileSync(configPath,JSON.stringify(generated,null,2), {mode:0o600});
}
const config = {
 root, dataDir,
 port:Number(process.env.PORT || 3000),
 apiPort:Number(process.env.API_PORT || 8000),
 host:process.env.HOST || '127.0.0.1',
 lab:process.env.LAB_MODE === 'true',
 mysql:process.env.USE_MYSQL === 'true',
 storage:process.env.STORAGE_MODE || 'local',
 s3Bucket:process.env.S3_BUCKET || '',
 s3Region:process.env.AWS_REGION || 'ap-southeast-1',
 cookieSecure:process.env.COOKIE_SECURE === 'true',
 apiKey:process.env.API_KEY || generated.apiKey,
 sessionSecret:process.env.SESSION_SECRET || generated.sessionSecret
};
if (config.lab && !['127.0.0.1','localhost','::1'].includes(config.host) && process.env.CLOUDVAULT_CONTAINER !== '1') {
 throw new Error('LAB_MODE=true refuses to bind to the public network. Use HOST=127.0.0.1.');
}
if (!['local','s3'].includes(config.storage)) throw new Error('STORAGE_MODE must be local or s3');
if (config.lab && config.storage === 's3') throw new Error('S3 is disabled in vulnerable LAB_MODE. Use local dummy files.');
if (config.storage === 's3' && !config.mysql) throw new Error('S3 storage requires USE_MYSQL=true for the protected deployment.');
// Prevent deliberate lab vulnerabilities from accessing externally hosted databases.
if (config.lab && config.mysql && !['127.0.0.1','localhost','::1'].includes(process.env.DB_HOST || '127.0.0.1')) {
 throw new Error('Remote MySQL is disabled in vulnerable LAB_MODE. Set LAB_MODE=false for Filess.io, or use an isolated local dummy database.');
}
module.exports = config;
