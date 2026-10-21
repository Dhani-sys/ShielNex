const { defaultCountryCode } = require('./config');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+\d{8,15}$/;

// Turns user input into { type: 'email' | 'phone', value } or null if invalid.
function parseIdentifier(input) {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw || raw.length > 254) return null;

  if (raw.includes('@')) {
    const email = raw.toLowerCase();
    return EMAIL_RE.test(email) ? { type: 'email', value: email } : null;
  }

  let phone = raw.replace(/[\s\-()]/g, '');
  if (!phone.startsWith('+')) {
    phone = phone.replace(/^0+/, '');
    phone = defaultCountryCode + phone;
  }
  return PHONE_RE.test(phone) ? { type: 'phone', value: phone } : null;
}

module.exports = { parseIdentifier };
