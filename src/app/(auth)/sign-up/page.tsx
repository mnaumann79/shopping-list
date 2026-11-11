"use client";

import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { getJoinPath } from "@/lib/app-routes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const signUpSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignUpValues = z.infer<typeof signUpSchema>;

function SignUpPageContent() {
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email");
  const [invitationEmail, setInvitationEmail] = useState("");
  const email = emailParam ?? invitationEmail;

  // Persist invite/join tokens and resolve email if not in URL
  useEffect(() => {
    const invitationId = searchParams.get("invitationId");
    if (invitationId) sessionStorage.setItem("pendingInvitationId", invitationId);

    const joinToken = searchParams.get("joinToken");
    if (joinToken) sessionStorage.setItem("pendingJoinToken", joinToken);

    // The URL email takes precedence over the invitation email lookup.
    if (emailParam) {
      return;
    }

    // Otherwise fetch from API
    const pendingId = invitationId ?? sessionStorage.getItem("pendingInvitationId");
    if (pendingId) {
      fetch(`/api/invitation-email?id=${encodeURIComponent(pendingId)}`)
        .then((res) => res.json())
        .then((data) => {
          console.log("[sign-up] API response:", data);
          if (data.email) setInvitationEmail(data.email);
        })
        .catch((err) => console.error("[sign-up] fetch failed:", err));
    }
  }, [emailParam, searchParams]);

  // key={email} forces the form to remount with correct defaultValues
  return (
    <>
      <p className="text-xs text-red-500 mb-2">DEBUG: email=&quot;{email}&quot; invitationId=&quot;{searchParams.get("invitationId")}&quot;</p>
      <SignUpForm key={email} initialEmail={email} />
    </>
  );
}

function SignUpForm({ initialEmail }: { initialEmail: string }) {
  const router = useRouter();

  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: initialEmail, password: "" },
  });

  async function onSubmit(values: SignUpValues) {
    const result = await authClient.signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
    });

    if (result.error) {
      form.setError("root", {
        message: result.error.message ?? "Sign up failed",
      });
      return;
    }

    // If user arrived via invite link, accept it directly (session is live after signUp)
    const pendingInvitationId = sessionStorage.getItem("pendingInvitationId");
    if (pendingInvitationId) {
      sessionStorage.removeItem("pendingInvitationId");
      try {
        await authClient.organization.acceptInvitation({ invitationId: pendingInvitationId });
        router.push("/dashboard");
        return;
      } catch {
        // Invitation may be expired/invalid — fall through to onboarding
      }
    }

    // If user arrived via join link, redirect back to /join so they auto-join now logged in
    const pendingJoinToken = sessionStorage.getItem("pendingJoinToken");
    if (pendingJoinToken) {
      sessionStorage.removeItem("pendingJoinToken");
      router.push(getJoinPath(pendingJoinToken));
      return;
    }

    router.push("/onboarding");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>Enter your details to get started</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Your name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="you@example.com" autoComplete="email" inputMode="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.errors.root && (
              <p className="text-sm text-destructive">
                {form.formState.errors.root.message}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              Sign up
            </Button>
          </form>
        </Form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/sign-in" className="underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpPageContent />
    </Suspense>
  );
}
