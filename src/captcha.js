// Cloudflare Turnstile server-side verification.
const { turnstile } = require('./config');

async function verifyCaptcha(token, ip) {
  if (!token || typeof token !== 'string') return false;
  const form = new URLSearchParams({ secret: turnstile.secretKey, response: token });
  if (ip) form.append('remoteip', ip);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error('CAPTCHA verification error:', err.message);
    return false;
  }
}

module.exports = { verifyCaptcha };
