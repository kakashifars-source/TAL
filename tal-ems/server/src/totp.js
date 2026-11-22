// Minimal RFC 6238 TOTP (SHA-1, 6 digits, 30s) compatible with Google/Microsoft Authenticator.
const crypto = require('crypto');
const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += ALPH[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += ALPH[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const clean = str.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = 0, value = 0; const out = [];
  for (const c of clean) { const i = ALPH.indexOf(c); if (i < 0) continue; value = (value << 5) | i; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function hotp(secret, counter) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const off = h[h.length - 1] & 15;
  const code = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1e6).padStart(6, '0');
}
const generateSecret = () => base32Encode(crypto.randomBytes(20));
function verify(secret, token, window = 1) {
  const t = String(token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(t)) return false;
  const c = Math.floor(Date.now() / 30000);
  for (let i = -window; i <= window; i++) {
    if (crypto.timingSafeEqual(Buffer.from(hotp(secret, c + i)), Buffer.from(t))) return true;
  }
  return false;
}
const uri = (secret, label, issuer) => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
const now = (secret) => hotp(secret, Math.floor(Date.now() / 30000));

module.exports = { generateSecret, verify, uri, now };
