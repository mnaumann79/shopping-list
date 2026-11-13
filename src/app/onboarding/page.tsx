"use client";

import { useEffect } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import {
  acceptInvitation,
  createHousehold,
  listHouseholds,
  setActiveHousehold,
  useSession,
} from "@/lib/auth-client";
import { MinimalHeader } from "@/components/MinimalHeader";
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

const onboardingSchema = z.object({
  name: z
    .string()
    .min(1, "Household name is required")
    .max(50, "Household name must be 50 characters or less"),
});

type OnboardingValues = z.infer<typeof onboardingSchema>;

export default function OnboardingPage() {
  const router = useRouter();
  const { isPending } = useSession();
  const [isResolvingHousehold, setIsResolvingHousehold] = useState(true);

  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { name: "" },
  });

  useEffect(() => {
    if (isPending) {
      return;
    }

    let cancelled = false;

    async function restoreExistingHousehold() {
      // Try to accept a pending invitation before checking existing orgs
      const pendingInvitationId = sessionStorage.getItem("pendingInvitationId");
      if (pendingInvitationId) {
        sessionStorage.removeItem("pendingInvitationId");
        try {
          const accepted = await acceptInvitation(pendingInvitationId);
          if (cancelled) return;
          if (accepted) {
            router.replace("/dashboard");
            return;
          }
        } catch {
          // Invitation expired/invalid — continue to check existing households
        }
      }

      if (cancelled) return;

      const households = await listHouseholds();

      if (cancelled) {
        return;
      }

      if (households.length === 0) {
        setIsResolvingHousehold(false);
        return;
      }

      const switched = await setActiveHousehold(households[0].id);

      if (cancelled) {
        return;
      }

      if (!switched) {
        form.setError("root", {
          message: "Failed to restore your existing household",
        });
        setIsResolvingHousehold(false);
        return;
      }

      router.replace("/dashboard");
    }

    void restoreExistingHousehold();

    return () => {
      cancelled = true;
    };
  }, [form, isPending, router]);

  async function onSubmit(values: OnboardingValues) {
    const created = await createHousehold(values.name);

    if ("error" in created) {
      form.setError("root", { message: created.error });
      return;
    }

    const switched = await setActiveHousehold(created.householdId);

    if (!switched) {
      form.setError("root", {
        message: "Failed to activate household",
      });
      return;
    }

    router.push("/dashboard");
  }

  // Don't render form while checking session or restoring an existing household
  if (isPending || isResolvingHousehold) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MinimalHeader />
      <div className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle>Create your household</CardTitle>
            <CardDescription>
              Give your household a name to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Household name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Smith Family"
                          {...field}
                        />
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
                <Button
                  type="submit"
                  className="w-full"
                  disabled={form.formState.isSubmitting}
                >
                  Create household
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}
