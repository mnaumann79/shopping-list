"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, setActiveHousehold } from "@/lib/auth-client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function JoinPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error" | "expired">(
    token ? "loading" : "error"
  );
  const [errorMessage, setErrorMessage] = useState(
    token ? "" : "Invalid join link — no token found."
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    async function handleJoin() {
      const session = await getSession();

      if (!session) {
        // Not logged in: preserve token, redirect to sign-up
        sessionStorage.setItem("pendingJoinToken", token!);
        router.push(`/sign-up?joinToken=${token}`);
        return;
      }

      // Logged in: auto-join via API
      try {
        const res = await fetch("/api/households/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (res.status === 410) {
          setStatus("expired");
          setErrorMessage(
            "This join link has expired. Ask the household admin to generate a new one."
          );
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setStatus("error");
          setErrorMessage(data.error ?? "Failed to join household");
          return;
        }

        const data = await res.json();
        // Set the joined household as active. The client asks the server to
        // do it: the `sb-household` cookie is httpOnly, and the server checks
        // the membership before it writes one.
        await setActiveHousehold(data.householdId);
        setStatus("success");
        setTimeout(() => {
          // The refresh that used to be here cancelled the push. The join
          // page is often reached by a client-side navigation — the sign-up
          // page sends the new account to the join link — and in that case
          // the refresh won the race: the join had succeeded, "Joined!" was
          // on the screen, and the page never reached the dashboard.
          router.push("/dashboard");
        }, 1500);
      } catch {
        setStatus("error");
        setErrorMessage("An unexpected error occurred.");
      }
    }

    handleJoin();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Joining household...</p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Joined!</CardTitle>
            <CardDescription>
              You have joined the household. Redirecting to your dashboard...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Link expired</CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => router.push("/sign-in")}
              className="w-full"
            >
              Go to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Unable to join</CardTitle>
          <CardDescription>{errorMessage}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => router.push("/sign-in")}
            className="w-full"
          >
            Go to sign in
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted-foreground">Loading join link...</p>
        </div>
      }
    >
      <JoinPageContent />
    </Suspense>
  );
}
