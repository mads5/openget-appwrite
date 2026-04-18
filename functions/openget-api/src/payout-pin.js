/**
 * 6-digit payout access PIN — stored as scrypt hash only (never plaintext).
 */
import crypto from 'crypto';

const PREFIX = 'ogp1';
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function parseStored(stored) {
  if (!stored || typeof stored !== 'string' || !stored.startsWith(`${PREFIX}$`)) return null;
  const parts = stored.split('$');
  if (parts.length !== 4) return null;
  const [, saltB64, hashB64] = parts;
  return {
    salt: Buffer.from(saltB64, 'base64'),
    hash: Buffer.from(hashB64, 'base64'),
  };
}

export function hashPayoutPin(pin) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pin), salt, 64, SCRYPT_OPTS);
  return `${PREFIX}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPayoutPin(pin, stored) {
  const parsed = parseStored(stored);
  if (!parsed) return false;
  try {
    const hash = crypto.scryptSync(String(pin), parsed.salt, 64, SCRYPT_OPTS);
    if (hash.length !== parsed.hash.length) return false;
    return crypto.timingSafeEqual(hash, parsed.hash);
  } catch {
    return false;
  }
}

export function isValidPinFormat(pin) {
  return typeof pin === 'string' && /^\d{6}$/.test(pin);
}
