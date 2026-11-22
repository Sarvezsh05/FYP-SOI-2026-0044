// Optional protected-mode password recovery email.
// Configure SMTP_HOST, SMTP_FROM and credentials in .env; do NOT publish them.
async function sendResetEmail(to, code){
  if(!process.env.SMTP_HOST || !process.env.SMTP_FROM){
    throw new Error('Password recovery email is not configured. Ask an administrator for help.');
  }
  let nodemailer;
  try{nodemailer=require('nodemailer');}
  catch{throw new Error('Email delivery requires npm install nodemailer');}
  const smtp=nodemailer.createTransport({
    host:process.env.SMTP_HOST,
    port:Number(process.env.SMTP_PORT||587),
    secure:process.env.SMTP_SECURE==='true',
    auth:process.env.SMTP_USER ? {user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined
  });
  await smtp.sendMail({
    from:process.env.SMTP_FROM,
    to,
    subject:'CloudVault password recovery',
    text:`Your one-time recovery code is: ${code}\nIt expires in 15 minutes. If you did not request it, ignore this message.`
  });
}
module.exports={sendResetEmail};
