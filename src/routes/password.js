const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const config = require('../config');
const { verifyCaptcha } = require('../captcha');
const { parseIdentifier } = require('../identifier');
const { findUserByEmail, findUserByPhone, updatePassword } = require('../auth0');
const { sendOtpEmail } = require('../mailer');
const { PasswordResetOtp, generateOtp, hashOtp, otpMatches } = require('../otp');

const router = express.Router();
const { otp: otpCfg } = config;
const TOKEN_AUDIENCE = 'shieldnex-password-reset';

// Same message whether or not the account exists (prevents account enumeration).
const GENERIC_SENT = 'If an account exists for this email or phone, a 6-digit code has been sent to its registered email.';
const INVALID_CODE = 'The code is invalid or has expired. Please request a new one.';

const limiter = (max, windowMinutes) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  });

async function findUser(identifier) {
  return identifier.type === 'email'
    ? findUserByEmail(identifier.value)
    : findUserByPhone(identifier.value);
}

// Step 1: request an OTP
router.post('/forgot', limiter(5, 15), async (req, res) => {
  const { identifier: rawIdentifier, captchaToken } = req.body || {};

  if (!(await verifyCaptcha(captchaToken, req.ip))) {
    return res.status(400).json({ error: 'CAPTCHA verification failed. Please try again.' });
  }

  const identifier = parseIdentifier(rawIdentifier);
  if (!identifier) {
    return res.status(400).json({ error: 'Enter a valid email address or phone number.' });
  }

  const response = {
    message: GENERIC_SENT,
    expiresInSeconds: otpCfg.ttlSeconds,
    resendAfterSeconds: otpCfg.resendCooldownSeconds,
  };

  try {
    const user = await findUser(identifier);
    if (!user || !user.email) return res.json(response);

    const existing = await PasswordResetOtp.findOne({ userId: user.user_id });
    const cooldownMs = otpCfg.resendCooldownSeconds * 1000;
    if (existing && Date.now() - existing.lastSentAt.getTime() < cooldownMs) {
      return res.json(response); // too soon to resend; keep the response identical
    }

    const code = generateOtp();
    const now = new Date();
    await PasswordResetOtp.findOneAndUpdate(
      { userId: user.user_id },
      {
        otpHash: hashOtp(code),
        attempts: 0,
        verified: false,
        lastSentAt: now,
        expiresAt: new Date(now.getTime() + otpCfg.ttlSeconds * 1000),
      },
      { upsert: true }
    );

    await sendOtpEmail(user.email, code);
  } catch (err) {
    console.error('forgot-password error:', err.message);
    // Still return the generic response so failures do not reveal whether the account exists.
  }

  return res.json(response);
});

// Step 2: verify the OTP -> returns a short-lived reset token
router.post('/verify', limiter(20, 15), async (req, res) => {
  const { identifier: rawIdentifier, otp } = req.body || {};
  const identifier = parseIdentifier(rawIdentifier);

  if (!identifier || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ error: INVALID_CODE });
  }

  try {
    const user = await findUser(identifier);
    if (!user) return res.status(400).json({ error: INVALID_CODE });

    // Atomically count this attempt; fails if the OTP is expired, used, or out of attempts.
    const record = await PasswordResetOtp.findOneAndUpdate(
      {
        userId: user.user_id,
        verified: false,
        expiresAt: { $gt: new Date() },
        attempts: { $lt: otpCfg.maxAttempts },
      },
      { $inc: { attempts: 1 } },
      { new: true }
    );

    if (!record) {
      const exhausted = await PasswordResetOtp.exists({
        userId: user.user_id,
        verified: false,
        attempts: { $gte: otpCfg.maxAttempts },
      });
      return res.status(exhausted ? 429 : 400).json({
        error: exhausted ? 'Too many wrong attempts. Please request a new code.' : INVALID_CODE,
      });
    }

    if (!otpMatches(otp, record.otpHash)) {
      const attemptsLeft = otpCfg.maxAttempts - record.attempts;
      return res.status(400).json({
        error: attemptsLeft > 0
          ? `Incorrect code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left.`
          : 'Too many wrong attempts. Please request a new code.',
        attemptsLeft,
      });
    }

    record.verified = true;
    record.expiresAt = new Date(Date.now() + otpCfg.resetWindowSeconds * 1000);
    await record.save();

    const resetToken = jwt.sign(
      { sub: user.user_id, rid: record._id.toString() },
      config.resetTokenSecret,
      { expiresIn: otpCfg.resetWindowSeconds, audience: TOKEN_AUDIENCE }
    );
    return res.json({ resetToken });
  } catch (err) {
    console.error('verify-otp error:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Step 3: set the new password
router.post('/reset', limiter(10, 15), async (req, res) => {
  const { resetToken, newPassword } = req.body || {};

  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
    return res.status(400).json({ error: 'Password must be 8 to 128 characters long.' });
  }

  let payload;
  try {
    payload = jwt.verify(resetToken, config.resetTokenSecret, { audience: TOKEN_AUDIENCE });
  } catch {
    return res.status(400).json({ error: 'Your reset session has expired. Please start again.' });
  }

  try {
    const record = await PasswordResetOtp.findOne({
      _id: payload.rid,
      userId: payload.sub,
      verified: true,
      expiresAt: { $gt: new Date() },
    });
    if (!record) {
      return res.status(400).json({ error: 'Your reset session has expired. Please start again.' });
    }

    try {
      await updatePassword(payload.sub, newPassword);
    } catch (err) {
      if (err.status === 400) {
        // Auth0 password policy errors (too weak, reused, contains personal data...)
        return res.status(400).json({ error: err.message || 'Password does not meet the requirements.' });
      }
      throw err;
    }

    await PasswordResetOtp.deleteOne({ _id: record._id }); // single use
    return res.json({ message: 'Your password has been changed. You can now log in.' });
  } catch (err) {
    console.error('reset-password error:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
