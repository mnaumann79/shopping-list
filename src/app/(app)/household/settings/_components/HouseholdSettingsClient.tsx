"use client";

import { useState, useEffect, useCallback } from "react";
import { listHouseholdMembers, useSession } from "@/lib/auth-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/toast";

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Store {
  id: string;
  householdId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function HouseholdSettingsClient({
  activeHouseholdId,
}: {
  activeHouseholdId: string | null;
}) {
  const { session } = useSession();

  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [addStoreOpen, setAddStoreOpen] = useState(false);
  const [addStoreName, setAddStoreName] = useState("");
  const [addingStore, setAddingStore] = useState(false);
  const [renameStoreOpen, setRenameStoreOpen] = useState(false);
  const [renameStoreId, setRenameStoreId] = useState<string | null>(null);
  const [renameStoreName, setRenameStoreName] = useState("");
  const [renamingStore, setRenamingStore] = useState(false);

  // Invite by email state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  // Join link state
  const [joinLink, setJoinLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [copied, setCopied] = useState(false);

  // Theme preview state — persisted to localStorage
  type ThemePreview = "warm" | "clean" | "bold" | null;
  const [themePreview, setThemePreview] = useState<ThemePreview>(() => {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem("theme-preview");
    if (saved === "warm" || saved === "clean" || saved === "bold") return saved;
    return null;
  });

  const currentMemberRole = session
    ? members.find((m) => m.id === session.user.id)?.role
    : undefined;
  const isAdmin = currentMemberRole === "owner" || currentMemberRole === "admin";

  const fetchMembers = useCallback(async () => {
    if (!activeHouseholdId) return;
    setMembersLoading(true);
    try {
      setMembers(await listHouseholdMembers());
    } catch {
      // silently fail — list will show empty
    } finally {
      setMembersLoading(false);
    }
  }, [activeHouseholdId]);

  const fetchStores = useCallback(async () => {
    if (!activeHouseholdId) return;
    setStoresLoading(true);
    try {
      const res = await fetch("/api/stores");
      const data = await res.json();
      if (res.ok) {
        setStores(data);
      }
    } catch {
      // leave current list in place
    } finally {
      setStoresLoading(false);
    }
  }, [activeHouseholdId]);

  useEffect(() => {
    async function loadSettings() {
      await Promise.all([fetchMembers(), fetchStores()]);
    }

    void loadSettings();
  }, [fetchMembers, fetchStores]);

  // Sync theme preview class to DOM
  useEffect(() => {
    document.documentElement.classList.remove("warm-preview", "clean-preview", "bold-preview");
    if (themePreview) {
      document.documentElement.classList.add(`${themePreview}-preview`);
      localStorage.setItem("theme-preview", themePreview);
    } else {
      localStorage.removeItem("theme-preview");
    }
  }, [themePreview]);

  async function handleInvite() {
    if (!inviteEmail.trim() || !activeHouseholdId) return;
    setInviting(true);
    try {
      const res = await fetch("/api/households/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        void toastError(data.error ?? "Failed to send invitation");
      } else {
        void toastSuccess(`Invitation sent to ${inviteEmail.trim()}`);
        setInviteEmail("");
      }
    } catch {
      void toastError("Failed to send invitation");
    } finally {
      setInviting(false);
    }
  }

  async function handleGenerateLink() {
    if (!activeHouseholdId) return;
    setGeneratingLink(true);
    try {
      const res = await fetch("/api/households/join-links", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        void toastError(data.error ?? "Failed to generate link");
      } else {
        setJoinLink(data.url);
      }
    } catch {
      void toastError("Failed to generate link");
    } finally {
      setGeneratingLink(false);
    }
  }

  async function handleCopy() {
    if (!joinLink) return;
    await navigator.clipboard.writeText(joinLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRemoveMember(memberId: string, isSelf: boolean) {
    if (!activeHouseholdId) return;
    try {
      const res = await fetch("/api/households/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      const data = await res.json();
      if (!res.ok) {
        void toastError(data.error ?? "Failed to remove member");
      } else {
        void toastSuccess(isSelf ? "You have left the household" : "Member removed");
        await fetchMembers();
      }
    } catch {
      void toastError("Failed to remove member");
    }
  }

  async function handleAddStore() {
    if (!addStoreName.trim()) return;
    setAddingStore(true);
    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addStoreName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        void toastError(data.error ?? "Failed to add store");
        return;
      }

      await fetchStores();
      setAddStoreName("");
      setAddStoreOpen(false);
      void toastSuccess("Store added");
    } catch {
      void toastError("Failed to add store");
    } finally {
      setAddingStore(false);
    }
  }

  async function handleRenameStore() {
    if (!renameStoreId || !renameStoreName.trim()) return;
    setRenamingStore(true);
    try {
      const res = await fetch(`/api/stores/${renameStoreId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameStoreName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        void toastError(data.error ?? "Failed to rename store");
        return;
      }

      await fetchStores();
      setRenameStoreId(null);
      setRenameStoreName("");
      setRenameStoreOpen(false);
      void toastSuccess("Store renamed");
    } catch {
      void toastError("Failed to rename store");
    } finally {
      setRenamingStore(false);
    }
  }

  async function handleDeleteStore(storeId: string) {
    const previousStores = stores;
    setStores((current) => current.filter((store) => store.id !== storeId));
    try {
      const res = await fetch(`/api/stores/${storeId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setStores(previousStores);
        void toastError(data.error ?? "Failed to delete store");
        return;
      }

      void toastSuccess("Store deleted");
    } catch {
      setStores(previousStores);
      void toastError("Failed to delete store");
    }
  }

  return (
    <main className="p-4 max-w-2xl mx-auto space-y-6">

      {/* Section: Theme Preview */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Theme Preview</h2>
          <p className="text-sm text-muted-foreground">
            Try alternative palettes before committing to one.
          </p>
        </div>

        {/* Warm palette toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="warm-preview">Warm & Inviting</Label>
            <p className="text-xs text-muted-foreground">
              Terracotta, sage, cream — soft and cozy
            </p>
          </div>
          <Switch
            id="warm-preview"
            checked={themePreview === "warm"}
            onCheckedChange={(checked) => setThemePreview(checked ? "warm" : null)}
          />
        </div>

        {/* Clean & Fresh toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="clean-preview">Clean & Fresh</Label>
            <p className="text-xs text-muted-foreground">
              Green, blueberry, white — modern grocery app
            </p>
          </div>
          <Switch
            id="clean-preview"
            checked={themePreview === "clean"}
            onCheckedChange={(checked) => setThemePreview(checked ? "clean" : null)}
          />
        </div>

        {/* Bold & Playful toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="bold-preview">Bold & Playful</Label>
            <p className="text-xs text-muted-foreground">
              Coral, teal, lavender — energetic and fun
            </p>
          </div>
          <Switch
            id="bold-preview"
            checked={themePreview === "bold"}
            onCheckedChange={(checked) => setThemePreview(checked ? "bold" : null)}
          />
        </div>
      </div>

      {/* Section 1: Invite by email (HSHD-02) */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Invite by email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                inputMode="email"
                placeholder="name@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                disabled={inviting}
                className="flex-1"
              />
              <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                {inviting ? "Sending…" : "Send invite"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 2: Shareable join link (HSHD-03) */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Shareable join link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={handleGenerateLink}
              disabled={generatingLink}
              variant="outline"
            >
              {generatingLink ? "Generating…" : "Generate join link"}
            </Button>

            {joinLink && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={joinLink}
                    className="flex-1 font-mono text-xs"
                  />
                  <Button variant="outline" onClick={handleCopy}>
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This link expires in 7 days.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Section 3: Member list (HSHD-04) */}
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <p className="text-sm text-muted-foreground">Loading members…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members found.</p>
          ) : (
            <ul className="space-y-3">
              {members.map((member) => {
                const isSelf = session?.user.id === member.id;
                const isOwnerOrAdmin = member.role === "owner" || member.role === "admin";
                return (
                  <li key={member.id} className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">
                        {member.name}
                        {isSelf && (
                          <span className="ml-1 text-muted-foreground">(you)</span>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground truncate">
                        {member.email}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                        isOwnerOrAdmin
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {member.role}
                    </span>
                    {isAdmin && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRemoveMember(member.id, isSelf)}
                      >
                        {isSelf ? "Leave" : "Remove"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Stores</CardTitle>
          <Button size="sm" onClick={() => setAddStoreOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add Store
          </Button>
        </CardHeader>
        <CardContent>
          {storesLoading ? (
            <p className="text-sm text-muted-foreground">Loading stores...</p>
          ) : stores.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No stores added yet. Use Add Store to get started.
            </p>
          ) : (
            <ul className="space-y-2">
              {stores.map((store) => (
                <li
                  key={store.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span className="text-sm font-medium">{store.name}</span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setRenameStoreId(store.id);
                        setRenameStoreName(store.name);
                        setRenameStoreOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteStore(store.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={addStoreOpen} onOpenChange={setAddStoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Store</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Store name"
              value={addStoreName}
              onChange={(event) => setAddStoreName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleAddStore()}
              disabled={addingStore}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStoreOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddStore} disabled={addingStore || !addStoreName.trim()}>
              {addingStore ? "Saving..." : "Add Store"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameStoreOpen}
        onOpenChange={(open) => {
          setRenameStoreOpen(open);
          if (!open) {
            setRenameStoreId(null);
            setRenameStoreName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Store</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Store name"
              value={renameStoreName}
              onChange={(event) => setRenameStoreName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleRenameStore()}
              disabled={renamingStore}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameStoreOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRenameStore}
              disabled={renamingStore || !renameStoreName.trim()}
            >
              {renamingStore ? "Saving..." : "Rename Store"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
