/**
 * The cookie that carries the active household.
 *
 * It is httpOnly and SameSite=Lax, so it is server-side only: the role is
 * never taken from it, and a household the caller is not a member of is
 * refused by the policies, not by the cookie.
 *
 * Creating a household, joining one and accepting an invitation all leave
 * the caller in a household, and that household becomes the active one — the
 * same thing the client's create-then-set-active pair did, in one server
 * call.
 */
export function withActiveHousehold(response: Response, householdId: string): Response {
  response.headers.append(
    "Set-Cookie",
    `sb-household=${householdId}; Path=/; HttpOnly; SameSite=Lax${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`,
  );
  return response;
}
