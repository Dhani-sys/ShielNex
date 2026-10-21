# ShieldNex

Login system for ShieldNex:
- **Login / signup** with ID + password via Auth0 Universal Login (one account per email, brute-force protection).
- **Forgot password**: the user enters an email or phone number with a CAPTCHA. If an account exists, a **6-digit OTP valid for 3 minutes** is emailed to the account's registered email, and the user then sets a new password.

See [PLAN.md](./PLAN.md) for the full design and setup progress.

## Project structure
```
public/              Frontend (served by Express)
  index.html         Login / signup / logout (Auth0)
  forgot.html        Forgot password: email/phone → OTP → new password
  js/app.js, js/forgot.js, css/style.css
src/
  server.js          Express app, security headers, static files
  config.js          Reads settings from .env
  routes/password.js /api/password/forgot | verify | reset
  auth0.js           Auth0 Management API (find user, update password)
  otp.js             OTP storage (MongoDB, auto-deleted after expiry)
  mailer.js          Sends OTP email via SMTP
  captcha.js         Cloudflare Turnstile verification
  identifier.js      Email / phone parsing
```

## OTP rules
| Rule | Value |
|---|---|
| Code | 6 digits, stored hashed |
| Valid for | 3 minutes |
| Wrong attempts | max 5, then a new code is needed |
| Resend | once every 60 seconds |
| Rate limit | 5 code requests per 15 min per IP |
| After verification | 10 minutes to set the new password, single use |

## Run locally
Requires Node.js 18+.
```bash
npm install
cp .env.example .env   # then fill in the secret values
npm start              # http://localhost:3000
```

## Environment variables
See [.env.example](./.env.example). Never commit `.env`.

| Variable | Where to get it |
|---|---|
| `AUTH0_DOMAIN`, `AUTH0_SPA_CLIENT_ID` | Auth0 → Applications → ShieldNex Web |
| `AUTH0_M2M_CLIENT_ID`, `AUTH0_M2M_CLIENT_SECRET` | Auth0 → Applications → ShieldNex API |
| `MONGODB_URI` | MongoDB Atlas → Connect → Drivers |
| `RESET_TOKEN_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `SMTP_*`, `MAIL_FROM` | Your email provider (Zoho / Hostinger / Brevo) |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare dashboard → Turnstile (test keys in `.env.example`) |
