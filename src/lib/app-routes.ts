const DEFAULT_APP_URL = "http://localhost:3000";

export function getAppBaseUrl() {
  return process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL;
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
