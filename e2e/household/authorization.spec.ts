import { expect, test } from "@playwright/test";
import { newUserContext, signUp, uniqueEmail } from "./helpers";

// The four verified defects this task closes. Each spec fails before the
// change and passes after it.
//
// The flows they drive are the new ones: a household is created through the
// application's own endpoint, an invitation is sent by the application, and
// the membership row is written by app_accept_household_invitation. They
// need the auth swap's uuid ids, so they are green when P0S-T06 has landed.

/** A signed-up user, with a context of their own. */
async function newUser(browser: import("@playwright/test").Browser, prefix: string) {
  const { context, page } = await newUserContext(browser);
  const email = uniqueEmail(prefix);
  await signUp(page, { name: prefix, email }, /\/onboarding/);
  return { context, page, email };
}

/** The household, the invitation and the plain member who accepted it. */
async function householdWithAPlainMember(browser: import("@playwright/test").Browser) {
  const owner = await newUser(browser, "owner");

  const created = await owner.page.request.post("/api/households", {
    data: { name: "Owner Household" },
  });
  expect(created.status()).toBe(201);
  const { householdId } = (await created.json()) as { householdId: string };

  const member = await newUser(browser, "member");

  const invited = await owner.page.request.post("/api/households/invitations", {
    data: { email: member.email, role: "member" },
  });
  expect(invited.status()).toBe(201);
  const { invitationId } = (await invited.json()) as { invitationId: string };

  const accepted = await member.page.request.post(
    `/api/households/invitations/${invitationId}/accept`,
  );
  expect(accepted.status()).toBe(200);

  return { owner, member, householdId, invitationId };
}

// S-1: a plain member could mint a shareable join link.
test("a plain member cannot mint a join link", async ({ browser }) => {
  const { owner, member } = await householdWithAPlainMember(browser);

  const minted = await member.page.request.post("/api/households/join-links");

  expect(minted.status()).toBe(403);

  // The owner still can: the check is a role check, not a blanket refusal.
  const ownerMinted = await owner.page.request.post("/api/households/join-links");
  expect(ownerMinted.status()).toBe(200);
});

// S-2: minting a link deleted the household's other links.
test("minting a join link leaves the household's other links alone", async ({ browser }) => {
  const { owner } = await householdWithAPlainMember(browser);

  const first = await owner.page.request.post("/api/households/join-links");
  expect(first.status()).toBe(200);
  const firstUrl = ((await first.json()) as { url: string }).url;
  const firstToken = new URL(firstUrl).searchParams.get("token");

  const second = await owner.page.request.post("/api/households/join-links");
  expect(second.status()).toBe(200);

  // The first link still works: the second mint did not invalidate it.
  const joiner = await newUser(browser, "joiner");
  const joined = await joiner.page.request.post("/api/households/join", {
    data: { token: firstToken },
  });
  expect(joined.status()).not.toBe(404);
  expect(joined.status()).toBe(200);
});

// S-3: an authorization failure answered 500.
test("an authorization failure answers 403, not 500", async ({ browser }) => {
  const { member } = await householdWithAPlainMember(browser);

  const invited = await member.page.request.post("/api/households/invitations", {
    data: { email: "somebody@example.test", role: "member" },
  });

  expect(invited.status()).toBe(403);
  expect(invited.status()).not.toBe(500);
});

// S-4: the invitation-email endpoint answered anybody who guessed an id.
test("the invitation-email endpoint needs a session, and the invitee", async ({ browser }) => {
  const { owner, member, invitationId } = await householdWithAPlainMember(browser);

  const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const response = await anonymous.request.get(`/api/invitation-email?id=${invitationId}`);
    expect(response.status()).toBe(401);
  } finally {
    await anonymous.close();
  }

  // The invitation id works as a bearer token, so a session is not enough:
  // the address comes back only to the person the invitation was sent to.
  const byOwner = await owner.page.request.get(`/api/invitation-email?id=${invitationId}`);
  expect(byOwner.status()).toBe(403);

  const byInvitee = await member.page.request.get(`/api/invitation-email?id=${invitationId}`);
  expect(byInvitee.status()).toBe(200);
  expect(await byInvitee.json()).toEqual({ email: member.email });
});
