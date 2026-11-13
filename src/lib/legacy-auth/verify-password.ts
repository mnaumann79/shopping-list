import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * The parameters Better Auth hashed with (§13.2c).
 *
 * The stored hash is `<saltHex>:<keyHex>`: the salt is 16 random bytes in
 * hex, and the key is 64 bytes in hex.
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

const HEX = /^[0-9a-f]+$/i;

/**
 * Whether the plaintext is the legacy password.
 *
 * The salt is the *hex string* — Better Auth passes it to scrypt as it is
 * stored, so its UTF-8 bytes are the salt — and the key is compared in
 * constant time, so a wrong password is not distinguishable from a right
 * one by how long the comparison took.
 */
export async function verifyLegacyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  const [saltHex, keyHex] = hash.split(":");
  if (!saltHex || !keyHex) {
    return false;
  }

  if (saltHex.length !== SALT_LENGTH * 2 || !HEX.test(saltHex)) {
    return false;
  }

  if (keyHex.length !== KEY_LENGTH * 2 || !HEX.test(keyHex)) {
    return false;
  }

  const derived = await deriveKey(password.normalize("NFKC"), saltHex);
  return timingSafeEqual(derived, Buffer.from(keyHex, "hex"));
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
const DUMMY_HASH = `${"0".repeat(SALT_LENGTH * 2)}:${"0".repeat(KEY_LENGTH * 2)}`;

/** The key for the password and the salt. */
function deriveKey(password: string, salt: string): Promise<Buffer> {
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
  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const key = await deriveKey(password.normalize("NFKC"), salt);
  return `${salt}:${key.toString("hex")}`;
}
