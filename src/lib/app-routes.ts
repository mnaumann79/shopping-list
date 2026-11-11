const DEFAULT_APP_URL = "http://localhost:3000";
const PRODUCTION_ORIGIN = "https://shopping-list-2026.vercel.app";

export function getAppBaseUrl() {
  return process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL;
}

// Resolves the auth base URL using the same precedence as better-auth's
// `baseURL` config. Single source of truth — used by both `baseURL` and
// `trustedOrigins` in `src/lib/auth.ts`.
export function getAuthBaseUrl(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return DEFAULT_APP_URL;
}

// Builds the `trustedOrigins` array for better-auth. Always trusts the
// production origin, the resolved base URL, and any Vercel preview URLs.
export function getAuthTrustedOrigins(): string[] {
  const resolved = getAuthBaseUrl();
  const extras = [
    process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : null,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  ].filter((origin): origin is string => origin !== null && origin !== resolved);

  return Array.from(new Set([PRODUCTION_ORIGIN, resolved, ...extras]));
}

export function getAcceptInvitePath(invitationId: string, email?: string) {
  let path = `/accept-invite?invitationId=${encodeURIComponent(invitationId)}`;
  if (email) path += `&email=${encodeURIComponent(email)}`;
  return path;
}

export function getJoinPath(token: string) {
  return `/join?token=${encodeURIComponent(token)}`;
}

export function getAcceptInviteUrl(invitationId: string, email?: string) {
  return `${getAppBaseUrl()}${getAcceptInvitePath(invitationId, email)}`;
}

export function getJoinUrl(token: string) {
  return `${getAppBaseUrl()}${getJoinPath(token)}`;
}
