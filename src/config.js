require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  appUrl: process.env.APP_URL || 'http://localhost:3000',

  auth0: {
    domain: required('AUTH0_DOMAIN'),
    spaClientId: required('AUTH0_SPA_CLIENT_ID'),
    m2mClientId: required('AUTH0_M2M_CLIENT_ID'),
    m2mClientSecret: required('AUTH0_M2M_CLIENT_SECRET'),
    connection: process.env.AUTH0_DB_CONNECTION || 'Username-Password-Authentication',
  },

  mongoUri: required('MONGODB_URI'),
  resetTokenSecret: required('RESET_TOKEN_SECRET'),

  smtp: {
    host: required('SMTP_HOST'),
    port: Number(process.env.SMTP_PORT) || 465,
    secure: (process.env.SMTP_SECURE || 'true') === 'true',
    user: required('SMTP_USER'),
    pass: required('SMTP_PASS'),
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
  },

  turnstile: {
    siteKey: required('TURNSTILE_SITE_KEY'),
    secretKey: required('TURNSTILE_SECRET_KEY'),
  },

  otp: {
    ttlSeconds: 180, // OTP valid for 3 minutes
    maxAttempts: 5, // wrong guesses allowed per OTP
    resendCooldownSeconds: 60,
    resetWindowSeconds: 600, // time to set a new password after OTP is verified
  },

  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || '+91',
};
