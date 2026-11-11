"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";

type User = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadUsers() {
      const res = await fetch("/api/admin/users");
      if (cancelled) return;

      if (!res.ok) {
        setError(res.status === 403 ? "Forbidden — set ADMIN_EMAIL in .env.local" : "Failed to load users");
        setLoading(false);
        return;
      }

      setUsers((await res.json()) as User[]);
      setLoading(false);
    }

    void loadUsers();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDelete(user: User) {
    setDeleting(true);
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    });
    setDeleting(false);

    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Failed to delete user");
      return;
    }

    setUsers((current) => current.filter((u) => u.id !== user.id));
    setPendingUser(null);
  }

  if (loading) return <p className="p-8 text-muted-foreground">Loading...</p>;
  if (error) return <p className="p-8 text-destructive">{error}</p>;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">Admin — Users</h1>
      {users.length === 0 ? (
        <p className="text-muted-foreground">No users found.</p>
      ) : (
        users.map((u) => (
          <Card key={u.id}>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <div>
                <CardTitle className="text-base">{u.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{u.email}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                aria-label={`Delete ${u.name}`}
                onClick={() => setPendingUser(u)}
              >
                <Trash2 className="size-4" />
              </Button>
            </CardHeader>
          </Card>
        ))
      )}

      <AlertDialog
        open={pendingUser !== null}
        onOpenChange={(open) => { if (!open) setPendingUser(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingUser?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes their account, sessions, memberships, and
              invitations. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose
              render={<Button variant="outline" disabled={deleting} />}
            >
              Cancel
            </AlertDialogClose>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => { if (pendingUser) handleDelete(pendingUser); }}
            >
              {deleting ? "Deleting…" : "Delete user"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
