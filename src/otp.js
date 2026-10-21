const crypto = require('crypto');
const mongoose = require('mongoose');
const { resetTokenSecret } = require('./config');

// One active password-reset record per user.
const otpSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  otpHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  verified: { type: Boolean, default: false },
  lastSentAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
});

// MongoDB deletes the record automatically once expiresAt has passed.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PasswordResetOtp = mongoose.model('PasswordResetOtp', otpSchema);

function generateOtp() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function hashOtp(code) {
  return crypto.createHmac('sha256', resetTokenSecret).update(code).digest('hex');
}

function otpMatches(code, hash) {
  const a = Buffer.from(hashOtp(code), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { PasswordResetOtp, generateOtp, hashOtp, otpMatches };
