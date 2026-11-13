import { hashPassword, verifyPassword } from "better-auth/crypto";

/**
 * Whether the plaintext is the legacy password.
 *
 * Better Auth hashes with scrypt, and the hash is the one in its `account`
 * row. This is Better Auth's own verification, so the two agree by
 * construction rather than by my reading of its format.
 */
export async function verifyLegacyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verifyPassword({ hash, password });
  } catch {
    // A hash that cannot be read is a password that does not match.
    return false;
  }
}

/**
 * The verification for an account that is not there.
 *
 * The failure answers have to be alike in their timing as well as in their
 * body, so "no such account" is verified against a hash of a password
 * nobody has: the same scrypt work, the same cost, and the same answer.
 */
export async function verifyAgainstNothing(password: string): Promise<boolean> {
  const hash = await dummyHash();
  return verifyLegacyPassword(hash, password);
}

let dummy: Promise<string> | undefined;

/** The hash of a password nobody has, made once and kept. */
function dummyHash(): Promise<string> {
  dummy ??= hashPassword("a password nobody has");
  return dummy;
}
