# ShieldNex Login System – Plan

## Requirements
- Login with ID (username/email) + password + CAPTCHA.
- Forgot password: user enters **email or phone** → check if an account exists → if yes, send a **6-digit OTP to the account's registered email**, valid for **3 minutes**.
- **One email = one account.**

## Current resources
| Resource | Status |
|---|---|
| Auth0 | Tenant `shieldnex` (Development, region EU-2) |
| Hostinger | Domain `sanatanup.in` (active, expires 2027-02-05). No hosting/email plan confirmed yet. |

## Environments
| | Domain | Purpose |
|---|---|---|
| Testing (now) | `shieldnex.sanatanup.in` (Hostinger domain `sanatanup.in`) | Build and test everything |
| Launch (later) | `shieldnex.in` | Final ShieldNex website. Email is already on Zoho (`@shieldnex.in`) |

**Moving to `shieldnex.in` at launch** (settings only, no code changes):
1. Auth0 → ShieldNex Web → add `https://shieldnex.in` to Allowed Callback / Logout / Web Origins.
2. Hosting env: `APP_URL=https://shieldnex.in`.
3. Point `shieldnex.in` DNS to the hosting.
4. Use real Turnstile keys for `shieldnex.in`; switch the Auth0 tenant environment to Production.

## Setup progress
| Item | Value / Status |
|---|---|
| Auth0 Domain | `shieldnex.eu.auth0.com` |
| Auth0 SPA app `ShieldNex Web` – Client ID (public) | `RXNj9ZdARAl2GeXkByG0qzUDB4ZClaCq` |
| Auth0 M2M app `ShieldNex API` | ✅ created, `read:users` + `update:users` (secret is never committed) |
| Database connection | ✅ email + phone (required, no SMS verification), sign-ups on, passwordless off |
| Social login | ❌ off (would break 1 email = 1 account) |
| Attack Protection | Brute-force on. Bot Detection is an Auth0 add-on → forgot password uses Cloudflare Turnstile |
| Code (frontend + OTP API) | ✅ written and tested locally (see README) |
| Email provider (SMTP) | ⏳ pending (Zoho / Hostinger / Brevo) |
| MongoDB Atlas | ⏳ pending |
| Cloudflare Turnstile keys | ⏳ pending (test keys in use) |
| Hosting + DNS (`shieldnex.sanatanup.in`) | ⏳ pending |

## Architecture
```
User → shieldnex.sanatanup.in (frontend)
          │
          ├── Login / Signup ──────► Auth0 Universal Login (password + CAPTCHA)
          │
          └── Forgot password ─────► ShieldNex API (Node.js + Express)
                                        ├── find user by email/phone (Auth0 Management API)
                                        ├── generate 6-digit OTP, valid 3 min
                                        ├── email OTP via SMTP (no-reply@sanatanup.in)
                                        └── set new password (Auth0 Management API)
```

## Responsibilities

### Handled by Auth0
| Requirement | How |
|---|---|
| ID + password login | Auth0 Username-Password database connection (Auth0 hashes the passwords) |
| 1 email = 1 account | Auth0 database connections enforce unique emails |
| Phone stored on account | Saved at signup (`user_metadata.phone` or the phone identifier) so lookup by phone works |
| CAPTCHA | Auth0 Bot Detection (Security → Attack Protection) with reCAPTCHA or another provider. **May need a paid Auth0 plan.** If it's locked, add Cloudflare Turnstile (free) to our own pages instead. |
| Brute-force protection | Auth0 built-in Brute-force Protection (free) |

### Built by us (OTP password reset)
Auth0's default reset sends a link, not an OTP, so we build this flow ourselves.

| Endpoint | Body | Behavior |
|---|---|---|
| `POST /api/forgot-password` | `{ identifier, captchaToken }` | Verify CAPTCHA → search Auth0 by email/phone → if found, create OTP and email it |
| `POST /api/verify-otp` | `{ identifier, otp }` | Check expiry, attempts, hash → return short-lived `resetToken` (10 min) |
| `POST /api/reset-password` | `{ resetToken, newPassword }` | Update password via Auth0 Management API, invalidate OTP |

**OTP rules**
- 6 digits, generated with a cryptographically secure random generator, stored **hashed**.
- `expiresAt = now + 3 min` (auto-deleted via a TTL index).
- Max 5 wrong attempts, then the OTP is invalid.
- Single use.
- Resend allowed once every 60 s; rate limit per IP and per identifier.

**Security**
- The response is always the same: *"If an account exists, a code has been sent."* The account-exists check still runs on the server, but this prevents account enumeration.
- Secrets in `.env` only (Auth0 M2M credentials, SMTP password, CAPTCHA secret).
- HTTPS only, `helmet`, CORS restricted to our domain.

### OTP record (database)
| Field | Notes |
|---|---|
| `userId` | Auth0 user id |
| `otpHash` | bcrypt/SHA-256 hash of OTP |
| `expiresAt` | now + 3 minutes (TTL index) |
| `attempts` | max 5 |
| `used` | boolean |

Database: MongoDB Atlas free tier (or Redis/Upstash; any store with TTL works).

## Tech stack
- **Frontend:** HTML/CSS/JS + `@auth0/auth0-spa-js` (login, signup, forgot, OTP, reset pages)
- **Backend:** Node.js, Express, `auth0` (Management API SDK), `nodemailer`, `bcrypt`, `jsonwebtoken`, `express-rate-limit`, `helmet`, `dotenv`, `mongoose`

## Setup required

### 1. Hosting (decision needed)
- **Option A, free:** Vercel/Render for frontend + API; point `sanatanup.in` DNS from Hostinger.
- **Option B, paid:** Hostinger Business/Cloud/VPS (must support Node.js; basic shared hosting cannot).

### 2. Email sending (decision needed)
- Hostinger Email (paid add-on) → `smtp.hostinger.com:465`, **or**
- Brevo / Resend (free tier) → verify `sanatanup.in` via DNS.
- Add **SPF, DKIM, DMARC** DNS records in Hostinger so mail doesn't go to spam.
- Also set this SMTP as Auth0's email provider (Auth0's built-in email is for testing only).

### 3. Auth0 configuration
- Database connection: Username-Password, require email, unique email.
- Application (Single Page App) → allowed callback/logout/origin URLs = our domain.
- Machine-to-Machine app for the API with `read:users`, `update:users` scopes.
- Attack Protection: Bot Detection (CAPTCHA) + Brute-force Protection.
- Optional custom domain: `login.sanatanup.in`.

## Build order
1. Configure Auth0 (connection, apps, CAPTCHA, brute-force).
2. Frontend: login, signup (with phone), forgot → OTP → reset pages.
3. Backend API: forgot-password / verify-otp / reset-password with the 3-min OTP.
4. Email provider + DNS records on Hostinger.
5. Deploy and connect the domain + SSL.
6. End-to-end testing (expired OTP, wrong OTP ×5, resend cooldown, duplicate email signup).

## Open questions
1. Hosting: any Hostinger hosting plan, or use free Vercel/Render?
2. Email: Hostinger Email mailbox, or Brevo/Resend?
3. Domain: `sanatanup.in` root or a subdomain like `shieldnex.sanatanup.in`?
4. Phone: lookup only (OTP by email), or also SMS OTP (paid, e.g. Twilio/MSG91)?
