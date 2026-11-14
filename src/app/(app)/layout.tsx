import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRequestSession } from "@/lib/request-auth";
import { RETURN_TO_HEADER, signInPath } from "@/lib/supabase/session-guard";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Defense-in-depth: validate session server-side, not just middleware
  // See CVE-2025-29927 — middleware alone is not a sufficient auth guard
  const session = await getRequestSession();
  if (!session) {
    // The guard in the middleware knows where the caller was going; this
    // carries it, so a caller who signs in lands on the page they asked for
    // instead of on the dashboard.
    redirect(signInPath((await headers()).get(RETURN_TO_HEADER)));
  }

  if (!session.activeHouseholdId) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
