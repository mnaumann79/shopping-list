import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/legacy-auth/legacy-account", () => ({
  findLegacyAccount: vi.fn(),
}));

vi.mock("@/lib/legacy-auth/verify-password", () => ({
  verifyLegacyPassword: vi.fn(),
  verifyAgainstNothing: vi.fn(),
}));

vi.mock("@/lib/legacy-auth/supabase", () => ({
  findGoTrueUser: vi.fn(),
  provisionGoTrueUser: vi.fn(),
  setGoTruePassword: vi.fn(),
}));

vi.mock("@/lib/legacy-auth/sign-in", () => ({
  signInWithPassword: vi.fn(),
}));

vi.mock("@/lib/legacy-auth/active-household", () => ({
  setActiveHousehold: vi.fn(),
}));

import { findLegacyAccount } from "@/lib/legacy-auth/legacy-account";
import { verifyLegacyPassword } from "@/lib/legacy-auth/verify-password";
import {
  findGoTrueUser,
  provisionGoTrueUser,
  setGoTruePassword,
} from "@/lib/legacy-auth/supabase";
import { signInWithPassword } from "@/lib/legacy-auth/sign-in";
import { setActiveHousehold } from "@/lib/legacy-auth/active-household";
import { POST } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/legacy-signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const LEGACY_ACCOUNT = {
  userId: "legacy-user-1",
  email: "person@example.test",
  name: "Person",
  passwordHash: "hash",
};

describe("POST /api/auth/legacy-signin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: Supabase Auth accepts the credentials, so the legacy path is
    // never reached.
    vi.mocked(signInWithPassword).mockResolvedValue(USER_ID);
  });

  test("returns 400 for a body that is not an email and a password", async () => {
    const res = await POST(request({ email: "not-an-email" }));

    expect(res.status).toBe(400);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  test("signs in with Supabase Auth when the account works there", async () => {
    const res = await POST(request({ email: "person@example.test", password: "secret" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // The legacy path is not reached: the account is already on the new side.
    expect(findLegacyAccount).not.toHaveBeenCalled();
    expect(setActiveHousehold).toHaveBeenCalledWith(USER_ID);
  });

  test("verifies the legacy password when Supabase Auth refuses", async () => {
    vi.mocked(signInWithPassword)
      .mockResolvedValueOnce(null) // Supabase Auth
      .mockResolvedValueOnce(USER_ID); // after the transitional path
    vi.mocked(findLegacyAccount).mockResolvedValue(LEGACY_ACCOUNT);
    vi.mocked(verifyLegacyPassword).mockResolvedValue(true);
    vi.mocked(findGoTrueUser).mockResolvedValue(null);

    const res = await POST(request({ email: "person@example.test", password: "secret" }));

    expect(res.status).toBe(200);
    expect(provisionGoTrueUser).toHaveBeenCalledWith({
      email: "person@example.test",
      password: "secret",
      name: "Person",
    });
    expect(setActiveHousehold).toHaveBeenCalledWith(USER_ID);
  });

  test("takes over an account that has never signed in", async () => {
    // The cutover provisions a GoTrue user for every legacy account, with a
    // password nobody has; those accounts have never signed in.
    vi.mocked(signInWithPassword)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(USER_ID);
    vi.mocked(findLegacyAccount).mockResolvedValue(LEGACY_ACCOUNT);
    vi.mocked(verifyLegacyPassword).mockResolvedValue(true);
    vi.mocked(findGoTrueUser).mockResolvedValue({
      id: USER_ID,
      email: "person@example.test",
      last_sign_in_at: null,
    } as never);

    const res = await POST(request({ email: "person@example.test", password: "secret" }));

    expect(res.status).toBe(200);
    expect(setGoTruePassword).toHaveBeenCalledWith(USER_ID, "secret");
    expect(provisionGoTrueUser).not.toHaveBeenCalled();
  });

  test("never takes over an account that has signed in", async () => {
    // The account works on the new side, so the Supabase failure was the
    // caller's own doing and the legacy path must not paper over it.
    vi.mocked(signInWithPassword).mockResolvedValue(null);
    vi.mocked(findLegacyAccount).mockResolvedValue(LEGACY_ACCOUNT);
    vi.mocked(verifyLegacyPassword).mockResolvedValue(true);
    vi.mocked(findGoTrueUser).mockResolvedValue({
      id: USER_ID,
      email: "person@example.test",
      last_sign_in_at: "2026-11-13T00:00:00Z",
    } as never);

    const res = await POST(request({ email: "person@example.test", password: "secret" }));

    expect(res.status).toBe(401);
    expect(setGoTruePassword).not.toHaveBeenCalled();
    expect(provisionGoTrueUser).not.toHaveBeenCalled();
  });

  test("the failures answer alike", async () => {
    // "No such account", "wrong password" and "not yours" are one answer, so
    // nothing tells a caller which one it was.
    vi.mocked(signInWithPassword).mockResolvedValue(null);
    vi.mocked(findLegacyAccount).mockResolvedValue(null);

    const noAccount = await POST(request({ email: "person@example.test", password: "secret" }));

    vi.mocked(findLegacyAccount).mockResolvedValue(LEGACY_ACCOUNT);
    vi.mocked(verifyLegacyPassword).mockResolvedValue(false);

    const wrongPassword = await POST(request({ email: "person@example.test", password: "wrong" }));

    expect(noAccount.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(await noAccount.json()).toEqual(await wrongPassword.json());
  });
});
