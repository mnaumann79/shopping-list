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
});
