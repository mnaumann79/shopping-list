"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import {
  Card,
  CardHeader,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function AcceptInvitePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitationId = searchParams.get("invitationId");
  const emailParam = searchParams.get("email");
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    invitationId ? "loading" : "error"
  );
  const [errorMessage, setErrorMessage] = useState(
    invitationId ? "" : "Invalid invitation link — no invitation ID found."
  );

  useEffect(() => {
    if (!invitationId) {
      return;
    }

    async function handleInvite() {
      const session = await authClient.getSession();

      if (!session.data) {
        // Not logged in: preserve invitationId in sessionStorage, redirect to sign-up
        sessionStorage.setItem("pendingInvitationId", invitationId!);
        const signUpParams = new URLSearchParams({ invitationId: invitationId! });
        // Include email so sign-up form can pre-fill it
        const emailFromUrl = emailParam;
        if (emailFromUrl) {
          signUpParams.set("email", emailFromUrl);
        } else {
          // Fetch email from invitation for older links without &email=
          try {
            const res = await fetch(`/api/invitation-email?id=${encodeURIComponent(invitationId!)}`);
            const data = await res.json();
            if (data.email) signUpParams.set("email", data.email);
          } catch { /* proceed without pre-filling */ }
        }
        router.push(`/sign-up?${signUpParams}`);
        return;
      }

      // Logged in: auto-accept immediately
      try {
        await authClient.organization.acceptInvitation({ invitationId: invitationId! });
        setStatus("success");
        setTimeout(() => router.push("/dashboard"), 1500);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to accept invitation";
        setStatus("error");
        setErrorMessage(message);
      }
    }

    handleInvite();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitationId, emailParam]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Accepting invitation...</p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Joined!</CardTitle>
            <CardDescription>You have joined the household. Redirecting...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Invitation error</CardTitle>
          <CardDescription>{errorMessage}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => router.push("/sign-in")} className="w-full">
            Go to sign in
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted-foreground">Loading invitation...</p>
        </div>
      }
    >
      <AcceptInvitePageContent />
    </Suspense>
  );
}
