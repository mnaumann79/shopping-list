"use client";

import { Suspense, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSession, signInWithPassword } from "@/lib/auth-client";
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

const signInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type SignInValues = z.infer<typeof signInSchema>;

/** The one message a failed sign-in gets. */
const SIGN_IN_FAILED = "Invalid email or password";

/**
 * Signs the visitor in.
 *
 * The transitional route tries Supabase Auth first and falls back to the
 * legacy password, so the page does not choose between the two paths: it
 * posts to the route and lets the route answer. The route sets the session
 * and the `sb-household` cookie server-side, so the page only has to know
 * whether it worked — it receives no token and sets no cookie.
 *
 * The route goes with the rollback window, and a 404 is how the page learns
 * that it is gone: the sign-in is Supabase Auth alone from then on. Nothing
 * has to be configured or remembered when the window closes.
 */
async function signIn(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await fetch("/api/auth/legacy-signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).catch(() => null);

  if (!response) return { ok: false, message: SIGN_IN_FAILED };

  if (response.status === 404) {
    const { error } = await signInWithPassword(email, password);
    return error ? { ok: false, message: SIGN_IN_FAILED } : { ok: true };
  }

  if (response.ok) return { ok: true };

  // The route answers 401 for every failure — a wrong password, an unknown
  // account and an account that is not the caller's are one failure to the
  // caller — and that one message is passed through unchanged.
  const body = await response.json().catch(() => null);
  const message =
    response.status === 401 && typeof body?.error === "string"
      ? body.error
      : SIGN_IN_FAILED;

  return { ok: false, message };
}

function SignInPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  // A visitor who already has a session has no business on this page.
  //
  // The middleware redirects one too, but it goes by the cookie: the check
  // here goes by the session. That is what makes a long idle session
  // recoverable — the server reads the access token without refreshing it, so
  // a token that expired while the browser was closed looks like no session
  // at all, while the browser still holds the refresh token and can renew it
  // and send the visitor on their way rather than making them sign in again.
  useEffect(() => {
    let cancelled = false;

    getSession().then((session) => {
      if (!cancelled && session) router.replace(returnTo ?? "/dashboard");
    });

    return () => {
      cancelled = true;
    };
  }, [router, returnTo]);

  async function onSubmit(values: SignInValues) {
    const result = await signIn(values.email, values.password);

    if (!result.ok) {
      form.setError("root", {
        message: result.message,
      });
      return;
    }

    router.push(returnTo ?? "/dashboard");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
              Sign in
            </Button>
          </form>
        </Form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/sign-up" className="underline">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInPageContent />
    </Suspense>
  );
}
