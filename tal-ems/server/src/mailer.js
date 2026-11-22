// Sends mail through SMTP when SMTP_HOST is configured; otherwise logs to the server console (development).
const nodemailer = require('nodemailer');
let transport = null;
if (process.env.SMTP_HOST) {
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}
async function sendMail(to, subject, text) {
  if (!transport) { console.log(`\n[mail:dev] to=${to}\nsubject=${subject}\n${text}\n`); return; }
  await transport.sendMail({ from: process.env.SMTP_FROM || 'TAL EMS <no-reply@tal.local>', to, subject, text });
}
module.exports = { sendMail };
