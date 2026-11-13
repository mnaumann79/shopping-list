import { describe, expect, it } from "vitest";
import {
  HOUSEHOLD_COOKIE,
  HOUSEHOLD_COOKIE_MAX_AGE_SECONDS,
  householdCookieOptions,
  isHouseholdId,
  readHouseholdId,
} from "./household-cookie";

const HOUSEHOLD = "3f6c1c0e-8a4d-4f1e-9c7b-2d5e6f8a0b1c";

function cookieStore(value?: string) {
  return {
    get(name: string) {
      return name === HOUSEHOLD_COOKIE && value !== undefined ? { value } : undefined;
    },
  };
}

describe("isHouseholdId", () => {
  it("accepts a uuid", () => {
    expect(isHouseholdId(HOUSEHOLD)).toBe(true);
    expect(isHouseholdId(HOUSEHOLD.toUpperCase())).toBe(true);
  });

  it("rejects anything that is not a uuid", () => {
    // A Better Auth organization id: the shape the cookie had before the
    // rename, and still a valid string.
    expect(isHouseholdId("dmKU7wxnmMNVj1M7I7xiV0W1uZAt2IT9")).toBe(false);
    expect(isHouseholdId("")).toBe(false);
    expect(isHouseholdId("not-a-uuid")).toBe(false);
    expect(isHouseholdId(`${HOUSEHOLD}x`)).toBe(false);
  });
});

describe("readHouseholdId", () => {
  it("returns the household the cookie names", () => {
    expect(readHouseholdId(cookieStore(HOUSEHOLD))).toBe(HOUSEHOLD);
  });

  it("returns null when the cookie is absent", () => {
    expect(readHouseholdId(cookieStore())).toBeNull();
  });

  it("returns null when the cookie names something that cannot be a household", () => {
    expect(readHouseholdId(cookieStore("dmKU7wxnmMNVj1M7I7xiV0W1uZAt2IT9"))).toBeNull();
    expect(readHouseholdId(cookieStore("')) OR 1=1 --"))).toBeNull();
  });
});

describe("householdCookieOptions", () => {
  it("is httpOnly, so the client cannot write its own household", () => {
    expect(householdCookieOptions().httpOnly).toBe(true);
  });

  it("lives at least as long as the 30-day session it points into", () => {
    expect(householdCookieOptions().maxAge).toBe(HOUSEHOLD_COOKIE_MAX_AGE_SECONDS);
    expect(HOUSEHOLD_COOKIE_MAX_AGE_SECONDS).toBeGreaterThanOrEqual(60 * 60 * 24 * 30);
  });

  it("is scoped to the whole site and does not travel cross-site", () => {
    expect(householdCookieOptions().path).toBe("/");
    expect(householdCookieOptions().sameSite).toBe("lax");
  });
});
