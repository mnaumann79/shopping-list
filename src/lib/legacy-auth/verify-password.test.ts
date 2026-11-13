import { describe, test, expect } from "vitest";
import {
  hashLegacyPassword,
  verifyAgainstNothing,
  verifyLegacyPassword,
} from "./verify-password";

/**
 * A hash Better Auth made, with its own implementation
 * (@better-auth/utils 0.4.2): the salt is the hex string it stored, and
 * the key is the scrypt of the password over it.
 */
const BETTER_AUTH_HASH =
  "2010d1d955e974bacb70481d7b1492d7:d63ba50956d1db877e674684932d69f2c6efb1c756e74f14316f69fbf7acee41a8eb0fecad8a55d6c9432cd4dbe90936876906597acd60bc69ba24e37a0f0d1e";

describe("the legacy password verification", () => {
  test("accepts a hash Better Auth made", async () => {
    expect(await verifyLegacyPassword(BETTER_AUTH_HASH, "correct horse")).toBe(true);
  });

  test("refuses the wrong password for a hash Better Auth made", async () => {
    expect(await verifyLegacyPassword(BETTER_AUTH_HASH, "wrong horse")).toBe(false);
  });

  test("accepts the password a hash was made from", async () => {
    const hash = await hashLegacyPassword("correct horse");

    expect(await verifyLegacyPassword(hash, "correct horse")).toBe(true);
  });

  test("refuses a different password", async () => {
    const hash = await hashLegacyPassword("correct horse");

    expect(await verifyLegacyPassword(hash, "wrong horse")).toBe(false);
  });

  test("normalises the password the way Better Auth did", async () => {
    // NFKC: the composed and the decomposed spelling of the same character
    // are one password.
    const hash = await hashLegacyPassword("caf\u00e9");

    // The same word with the accent decomposed: one password, one hash.
    expect(await verifyLegacyPassword(hash, "cafe\u0301")).toBe(true);
  });

  test("refuses a hash that is not a hash", async () => {
    expect(await verifyLegacyPassword("not-a-hash", "secret")).toBe(false);
  });

  test("an account that is not there costs the same and answers the same", async () => {
    // The verification runs against a hash of a password nobody has, so the
    // failure is the same work and the same answer as a wrong password.
    expect(await verifyAgainstNothing("secret")).toBe(false);
  });
});
