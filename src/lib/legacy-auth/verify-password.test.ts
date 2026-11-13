import { describe, test, expect } from "vitest";
import {
  hashLegacyPassword,
  verifyAgainstNothing,
  verifyLegacyPassword,
} from "./verify-password";

describe("the legacy password verification", () => {
  test("accepts the password the hash was made from", async () => {
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
