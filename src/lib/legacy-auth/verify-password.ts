import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * The parameters Better Auth hashed with (§13.2c).
 *
 * The stored hash is `<saltHex>:<keyHex>`: a 16-byte random salt and a
 * 64-byte key, the key being scrypt over the password normalised NFKC.
 */
const N = 16384;
const r = 16;
const p = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * node's scrypt needs 128·N·r bytes, which is 32 MiB here — and node's
 * default limit is exactly 32 MiB, so the call can fail with "memory limit
 * exceeded" instead of producing a key. Better Auth's own implementation
 * passes twice what is needed, and so does this one.
 */
const MAX_MEM = 128 * N * r * 2;

/**
 * Whether the plaintext is the legacy password.
 *
 * The comparison is a constant-time one, so a wrong password is not
 * distinguishable from a right one by how long the comparison took.
 */
export async function verifyLegacyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  const [saltHex, keyHex] = hash.split(":");
  if (!saltHex || !keyHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) {
    return false;
  }

  const derived = await deriveKey(password.normalize("NFKC"), salt);
  return timingSafeEqual(derived, expected);
}

/**
 * The verification for an account that is not there.
 *
 * The failure answers have to be alike in their timing as well as in their
 * body, so "no such account" is verified against a hash like any other: the
 * same scrypt work, the same cost, and the same answer.
 */
export async function verifyAgainstNothing(password: string): Promise<boolean> {
  return verifyLegacyPassword(DUMMY_HASH, password);
}

/** A hash of a password nobody has: a salt and a key of zeros. */
const DUMMY_HASH = `${"00".repeat(SALT_LENGTH)}:${"00".repeat(KEY_LENGTH)}`;

/** The key for the password and the salt. */
function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N, r, p, maxmem: MAX_MEM }, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key);
    });
  });
}

/** The legacy hash of a password, in Better Auth's format. */
export async function hashLegacyPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password.normalize("NFKC"), salt);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}
