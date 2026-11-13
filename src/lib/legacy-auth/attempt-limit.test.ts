import { describe, test, expect } from "vitest";
import { admit, liveCounters, settle } from "./attempt-limit";

/** An admitted attempt that fails. */
function failedAttempt(client: string, email: string): boolean {
  const admitted = admit(client, email);
  if (admitted) {
    settle(client, email, false);
  }
  return admitted;
}

describe("the transitional sign-in's admission limit", () => {
  test("the address's quota is five failures", () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(failedAttempt("client-a", "a@example.test")).toBe(true);
    }

    expect(admit("client-a", "a@example.test")).toBe(false);
  });

  test("the client's quota is ten failures", () => {
    // A different address each time, so it is the client's quota that runs
    // out and not the address's.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(failedAttempt("client-b", `b-${attempt}@example.test`)).toBe(true);
    }

    expect(admit("client-b", "b-another@example.test")).toBe(false);
  });

  test("a blocked client cannot make the counters grow", () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      failedAttempt("client-d", `d-${attempt}@example.test`);
    }

    const before = liveCounters();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(admit("client-d", `other-${attempt}@example.test`)).toBe(false);
    }

    expect(liveCounters()).toBe(before);
  });

  test("a successful sign-in clears the address's failures and not the client's", () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      failedAttempt("client-c", "c@example.test");
    }

    // The address is over its quota, so the attempt is refused.
    expect(admit("client-c", "c@example.test")).toBe(false);

    // A sign-in that worked clears the address's failures, so the next five
    // attempts are admitted again.
    settle("client-c", "c@example.test", true);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(admit("client-c", "c@example.test")).toBe(true);
      settle("client-c", "c@example.test", false);
    }
  });

  test("an admitted attempt is reserved while it is in flight", () => {
    expect(admit("client-e", "e@example.test")).toBe(true);

    // The reservation counts against the quota before the attempt settles.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(admit("client-e", "e@example.test")).toBe(true);
    }

    expect(admit("client-e", "e@example.test")).toBe(false);

    settle("client-e", "e@example.test", false);
  });

  test("sign-ins that worked do not fill the counters against the next address", () => {
    // A thousand addresses sign in and succeed. Their counters carry no
    // quota — nothing failed — so they must not crowd out the next address.
    for (let client = 0; client < 100; client += 1) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        expect(admit(`success-${client}`, `success-${client}-${attempt}@example.test`)).toBe(
          true,
        );
        settle(
          `success-${client}`,
          `success-${client}-${attempt}@example.test`,
          true,
        );
      }
    }

    expect(admit("client-g", "g@example.test")).toBe(true);
  });

  // This one is last because it fills the counters, and the counters are
  // shared by the tests in this file.
  test("a flood of other addresses does not reset a target's quota", () => {
    // Five failures take the target to its quota.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(failedAttempt("client-f", "target@example.test")).toBe(true);
    }

    expect(admit("client-f", "target@example.test")).toBe(false);

    // The attacker floods the counters with other addresses, spending the
    // quota each of its clients has of its own.
    for (let client = 0; client < 200; client += 1) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        failedAttempt(`flood-${client}`, `flood-${client}-${attempt}@example.test`);
      }
    }

    // The target's quota is still its quota: the flood bought it nothing.
    expect(admit("client-f", "target@example.test")).toBe(false);

    // The counters are still bounded: the flood did not make them grow.
    expect(liveCounters()).toBeLessThanOrEqual(2000);
  });
});
