const nodemailer = require('nodemailer');
const { smtp, otp } = require('./config');

const transporter = nodemailer.createTransport({
  host: smtp.host,
  port: smtp.port,
  secure: smtp.secure,
  auth: { user: smtp.user, pass: smtp.pass },
});

async function sendOtpEmail(to, code) {
  const minutes = Math.round(otp.ttlSeconds / 60);
  await transporter.sendMail({
    from: smtp.from,
    to,
    subject: `${code} is your ShieldNex password reset code`,
    text:
      `Your ShieldNex password reset code is ${code}.\n\n` +
      `It expires in ${minutes} minutes. If you did not request this, you can ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px">
        <h2 style="color:#4f46e5;margin:0 0 16px">ShieldNex</h2>
        <p>Use this code to reset your password:</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0">${code}</p>
        <p>This code expires in <b>${minutes} minutes</b>.</p>
        <p style="color:#666;font-size:13px">If you did not request a password reset, you can safely ignore this email.</p>
      </div>`,
  });
}

module.exports = { sendOtpEmail };
