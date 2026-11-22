// File bytes are stored separately from MySQL metadata.
// local: private disk for development/lab; s3: private AWS bucket for protected EC2.
// AWS credentials are NOT hard-coded: SDK v3 uses the EC2 IAM role automatically.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const uploadDir = path.join(config.dataDir, 'uploads');
fs.mkdirSync(uploadDir, {recursive: true});
let client;
function s3Sdk(){
  if(config.lab) throw new Error('S3 is unavailable to the vulnerable lab');
  try {return require('@aws-sdk/client-s3');}
  catch {throw new Error('Install the S3 package: npm install @aws-sdk/client-s3');}
}
function s3Client(){
  if(!config.s3Bucket) throw new Error('S3_BUCKET is not configured');
  const sdk = s3Sdk();
  if(!client) client = new sdk.S3Client({region: config.s3Region});
  return {sdk, client};
}
function localFilePath(key){
  // Never trust a saved database path: restrict reads/deletions to uploadDir.
  if(!/^[a-f0-9]{32,64}$/.test(String(key||''))) throw new Error('Invalid saved file key');
  return path.join(uploadDir, key);
}
async function save(buffer, mime, userId){
  const key = crypto.randomBytes(20).toString('hex');
  if(config.storage === 's3'){
    const {sdk,client}=s3Client();
    const objectKey=`cloudvault/${Number(userId)}/${key}`;
    await client.send(new sdk.PutObjectCommand({Bucket:config.s3Bucket,Key:objectKey,Body:buffer,ContentType:mime}));
    return {s3_key:objectKey,local_path:null};
  }
  fs.writeFileSync(localFilePath(key),buffer,{flag:'wx',mode:0o600});
  return {s3_key:null,local_path:key};
}
async function read(file){
  if(file.s3_key){
    const {sdk,client}=s3Client();
    const result=await client.send(new sdk.GetObjectCommand({Bucket:config.s3Bucket,Key:file.s3_key}));
    return Buffer.from(await result.Body.transformToByteArray());
  }
  return fs.readFileSync(localFilePath(file.local_path));
}
async function remove(file){
  if(file.s3_key){
    const {sdk,client}=s3Client();
    await client.send(new sdk.DeleteObjectCommand({Bucket:config.s3Bucket,Key:file.s3_key}));
  }else if(file.local_path){
    try{fs.unlinkSync(localFilePath(file.local_path));}catch(error){if(error.code!=='ENOENT')throw error;}
  }
}
module.exports={save,read,remove};
