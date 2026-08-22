import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Crown, Shield, User as UserIcon, UserMinus, UserPlus, KeyRound, Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProject, useTracker } from "@/lib/tracker/store";
import { useAuth } from "@/lib/auth-context";
import { graphqlRequest } from "@/lib/graphql-client";
import type { ProjectRole, User } from "@/lib/tracker/types";

// @ts-ignore
export const Route = createFileRoute("/projects/$projectId/members")({
  head: () => ({
    meta: [
      { title: "Project Members | Block Work" },
      { name: "description", content: "View and manage project members and their roles." },
      { property: "og:title", content: "Project Members | Block Work" },
    ],
  }),
  component: MembersPage,
});

// ── GraphQL queries & mutations ──────────────────────────────────────────────
const GET_ACTIVE_JOIN_CODE_QUERY = `
  query GetActiveJoinCode($projectId: ID!) {
    activeJoinCode(projectId: $projectId) {
      code
      expiresAt
      alreadyExists
    }
  }
`;

const GENERATE_JOIN_CODE_MUTATION = `
  mutation GenerateProjectJoinCode($projectId: ID!, $durationMinutes: Int!, $override: Boolean) {
    generateProjectJoinCode(projectId: $projectId, durationMinutes: $durationMinutes, override: $override) {
      code
      expiresAt
      alreadyExists
    }
  }
`;

const INVITE_MUTATION = `
  mutation InviteToProject($projectId: ID!, $email: String!, $role: String) {
    inviteToProject(projectId: $projectId, email: $email, role: $role) {
      id
      name
      email
      role
    }
  }
`;

const REMOVE_MUTATION = `
  mutation RemoveFromProject($projectId: ID!, $userId: ID!) {
    removeFromProject(projectId: $projectId, userId: $userId)
  }
`;

const UPDATE_ROLE_MUTATION = `
  mutation UpdateProjectMemberRole($projectId: ID!, $userId: ID!, $role: String!) {
    updateProjectMemberRole(projectId: $projectId, userId: $userId, role: $role) {
      id
      role
    }
  }
`;

const SET_API_KEY_MUTATION = `
  mutation SetProjectApiKey($projectId: ID!, $provider: String!, $apiKey: String!) {
    setProjectApiKey(projectId: $projectId, provider: $provider, apiKey: $apiKey)
  }
`;

const REMOVE_API_KEY_MUTATION = `
  mutation RemoveProjectApiKey($projectId: ID!) {
    removeProjectApiKey(projectId: $projectId)
  }
`;

const PROJECT_HAS_AI_KEY_QUERY = `
  query ProjectHasAiKey($projectId: ID!) {
    projectHasAiKey(projectId: $projectId)
  }
`;

// ── Role metadata ────────────────────────────────────────────────────────────
const ROLE_META: Record<ProjectRole, { label: string; icon: typeof Crown; color: string }> = {
  owner: { label: "Owner", icon: Crown, color: "bg-urgent text-urgent-foreground" },
  admin: { label: "Admin", icon: Shield, color: "bg-progress text-progress-foreground" },
  member: { label: "Member", icon: UserIcon, color: "bg-secondary text-secondary-foreground" },
};

function RoleBadge({ role }: { role: ProjectRole }) {
  const meta = ROLE_META[role];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 border-2 border-foreground px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest ${meta.color}`}
    >
      <Icon className="size-3" />
      {meta.label}
    </span>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
function MembersSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 animate-pulse">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="h-3 w-28 rounded bg-foreground/20" />
          <div className="h-8 w-56 rounded bg-foreground/30" />
          <div className="h-3 w-40 rounded bg-foreground/15" />
        </div>
        <div className="h-10 w-36 rounded border-2 border-foreground/25 bg-foreground/15" />
      </header>

      {/* TOTP card skeleton */}
      <div className="nb space-y-4 p-5 border-foreground/30">
        <div className="space-y-1.5">
          <div className="h-5 w-56 rounded bg-foreground/25" />
          <div className="h-3 w-72 rounded bg-foreground/15" />
        </div>
        <div className="flex gap-3">
          <div className="h-9 w-40 rounded border-2 border-foreground/25 bg-foreground/10" />
          <div className="h-9 w-36 rounded border-2 border-foreground/25 bg-foreground/15" />
        </div>
      </div>

      {/* Role legend skeleton */}
      <div className="nb-flat flex flex-wrap gap-6 p-4 border-foreground/20">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-5 w-20 rounded bg-foreground/20" />
            <div className="h-3 w-36 rounded bg-foreground/15" />
          </div>
        ))}
      </div>

      {/* Member list skeleton */}
      <section className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="nb flex items-center gap-4 p-4 border-foreground/25">
            <div className="size-12 rounded-full bg-foreground/25 border-2 border-foreground/25" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-36 rounded bg-foreground/30" />
              <div className="h-3 w-48 rounded bg-foreground/15" />
            </div>
            <div className="h-5 w-20 rounded bg-foreground/20" />
          </div>
        ))}
      </section>
    </div>
  );
}

// ── Invite Dialog ────────────────────────────────────────────────────────────
function InviteDialog({ projectId, onSuccess }: { projectId: string; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("member");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim()) {
      toast.error("Enter an email address.");
      return;
    }
    setLoading(true);
    try {
      await graphqlRequest(INVITE_MUTATION, { projectId, email: email.trim(), role });
      toast.success(`Invited ${email} as ${role}.`);
      setEmail("");
      setRole("member");
      setOpen(false);
      onSuccess();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to invite member.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button id="invite-member-btn" className="nb nb-hover gap-2 font-semibold">
          <UserPlus className="size-4" />
          Invite member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display uppercase">Invite to project</DialogTitle>
          <DialogDescription>
            The user must already have a Block Work account.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as ProjectRole)}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin — can manage issues and members</SelectItem>
                <SelectItem value="member">Member — can view members, cannot invite</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={loading} className="nb-sm font-semibold">
            {loading ? "Sending…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Member Card ──────────────────────────────────────────────────────────────
function MemberCard({
  member,
  projectId,
  myRole,
  isMe,
  onUpdated,
}: {
  member: User;
  projectId: string;
  myRole: ProjectRole;
  isMe: boolean;
  onUpdated: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const memberRole = (member.role ?? "member") as ProjectRole;

  const canRemove =
    !isMe &&
    (myRole === "owner" ||
      (myRole === "admin" && memberRole === "member"));

  const canChangeRole = myRole === "owner" && !isMe && memberRole !== "owner";

  const handleRemove = async () => {
    setLoading(true);
    try {
      await graphqlRequest(REMOVE_MUTATION, { projectId, userId: member.id });
      toast.success(`${member.name} removed from project.`);
      onUpdated();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to remove member.");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (newRole: string) => {
    setLoading(true);
    try {
      await graphqlRequest(UPDATE_ROLE_MUTATION, { projectId, userId: member.id, role: newRole });
      toast.success(`${member.name} is now ${newRole}.`);
      onUpdated();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update role.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="nb nb-hover flex items-center gap-4 p-4">
      {/* Avatar */}
      <Avatar className="size-12 border-2 border-foreground">
        <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
        <AvatarFallback className="bg-primary font-display text-sm font-black uppercase">
          {member.initials}
        </AvatarFallback>
      </Avatar>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">{member.name}</span>
          {isMe && (
            <Badge variant="outline" className="border-foreground text-[0.6rem] uppercase tracking-wider">
              You
            </Badge>
          )}
          <RoleBadge role={memberRole} />
        </div>
        {member.email && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{member.email}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {canChangeRole && (
          <Select value={memberRole} onValueChange={handleRoleChange} disabled={loading}>
            <SelectTrigger id={`role-select-${member.id}`} className="nb-flat h-8 text-xs w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="member">Member</SelectItem>
            </SelectContent>
          </Select>
        )}

        {canRemove && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                id={`remove-member-${member.id}`}
                variant="ghost"
                size="icon"
                disabled={loading}
                className="nb-flat size-8 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                <UserMinus className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display uppercase">Remove member?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove <strong>{member.name}</strong> from the project. They will lose
                  access immediately.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleRemove}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}

// ── Join Code Card ───────────────────────────────────────────────────────────
function GenerateJoinCodeCard({ projectId }: { projectId: string }) {
  const [duration, setDuration] = useState("60");
  const [loading, setLoading] = useState(false);
  const [activeCode, setActiveCode] = useState<{ code: string; expiresAt: string } | null>(null);
  // When the backend reports an active code exists and override=false, we store the
  // conflict response here and show an AlertDialog asking the user to confirm override.
  const [conflictCode, setConflictCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);

  // Fetch the active code on mount so navigating away and back still shows it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingExisting(true);
      try {
        const res = await graphqlRequest<{
          activeJoinCode: { code: string | null; expiresAt: string | null; alreadyExists: boolean };
        }>(GET_ACTIVE_JOIN_CODE_QUERY, { projectId });
        if (!cancelled && res.activeJoinCode?.alreadyExists && res.activeJoinCode.code && res.activeJoinCode.expiresAt) {
          const isStillValid = new Date(res.activeJoinCode.expiresAt).getTime() > Date.now();
          if (isStillValid) {
            setActiveCode({
              code: res.activeJoinCode.code,
              expiresAt: res.activeJoinCode.expiresAt,
            });
          } else {
            setActiveCode(null);
          }
        } else if (!cancelled) {
          setActiveCode(null);
        }
      } catch {
        // Not critical — silently ignore if the query fails (e.g. permission)
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // Auto-clear active code when it expires in real time while user is on the page
  useEffect(() => {
    if (!activeCode?.expiresAt) return;

    const expiryMs = new Date(activeCode.expiresAt).getTime() - Date.now();
    if (expiryMs <= 0) {
      setActiveCode(null);
      return;
    }

    const timer = setTimeout(() => {
      setActiveCode(null);
      toast.info("Join passcode has expired.");
    }, expiryMs);

    return () => clearTimeout(timer);
  }, [activeCode]);

  // Auto-close conflict dialog if conflict code expires in real time
  useEffect(() => {
    if (!conflictCode?.expiresAt) return;

    const expiryMs = new Date(conflictCode.expiresAt).getTime() - Date.now();
    if (expiryMs <= 0) {
      setConflictCode(null);
      setShowOverrideDialog(false);
      return;
    }

    const timer = setTimeout(() => {
      setConflictCode(null);
      setShowOverrideDialog(false);
    }, expiryMs);

    return () => clearTimeout(timer);
  }, [conflictCode]);

  const generate = async (override: boolean) => {
    setLoading(true);
    try {
      const res = await graphqlRequest<{
        generateProjectJoinCode: { code: string; expiresAt: string; alreadyExists: boolean };
      }>(GENERATE_JOIN_CODE_MUTATION, {
        projectId,
        durationMinutes: parseInt(duration, 10),
        override,
      });

      const result = res.generateProjectJoinCode;

      // Backend returned the existing code without creating a new one (override=false conflict)
      if (result.alreadyExists && !override) {
        const isStillValid = result.expiresAt && new Date(result.expiresAt).getTime() > Date.now();
        if (isStillValid) {
          setConflictCode({ code: result.code, expiresAt: result.expiresAt });
          setShowOverrideDialog(true);
          return;
        }
        // If expired according to client time, force generate with override=true
        return generate(true);
      }

      // New code was generated (either no existing, or override=true)
      setActiveCode({ code: result.code, expiresAt: result.expiresAt });
      setConflictCode(null);
      setShowOverrideDialog(false);
      toast.success(`Join passcode generated: ${result.code}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate join passcode.");
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    if (activeCode) {
      navigator.clipboard.writeText(activeCode.code);
      toast.success("Passcode copied to clipboard!");
    }
  };

  return (
    <>
      {/* Override confirmation dialog */}
      <AlertDialog open={showOverrideDialog} onOpenChange={setShowOverrideDialog}>
        <AlertDialogContent className="sm:max-w-xl p-0 overflow-hidden">
          {/* Header — no colored background, icon is primary-orange filled block */}
          <div className="px-6 pt-5 pb-0 flex items-start gap-4">
            {/* Filled warning icon: primary-orange bg, dark icon */}
            <div className="shrink-0 size-10 bg-primary border-2 border-foreground flex items-center justify-center rounded-sm">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="size-5 text-foreground"
                aria-hidden
              >
                <path d="M12 2.5L1.5 21h21L12 2.5zm0 3.5 8 14H4L12 6zm-1 5v4h2v-4h-2zm0 6v2h2v-2h-2z" />
              </svg>
            </div>
            <div className="min-w-0">
              <AlertDialogTitle className="font-display text-lg uppercase tracking-wide text-foreground leading-tight">
                Active Passcode Exists
              </AlertDialogTitle>
              {conflictCode && (
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  Current code:{" "}
                  <span className="font-mono font-black tracking-widest text-foreground">
                    {conflictCode.code}
                  </span>{" "}
                  · expires{" "}
                  {new Date(conflictCode.expiresAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="px-6 pb-5 space-y-4">
            <AlertDialogDescription asChild>
              <div className="text-sm text-foreground space-y-3">
                <p className="text-muted-foreground">
                  Generating a new passcode will{" "}
                  <strong className="text-destructive">immediately invalidate</strong> the
                  current one — anyone who was given the old code will no longer be able to
                  use it to join.
                </p>

                <div className="nb-flat bg-secondary p-4 space-y-2">
                  <p className="label-caps">When you should invalidate</p>
                  <ul className="space-y-1.5 text-sm text-foreground/80">
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 size-1.5 rounded-full bg-foreground shrink-0 mt-1.5" />
                      The current code was accidentally shared with the wrong person.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 size-1.5 rounded-full bg-foreground shrink-0 mt-1.5" />
                      You want to set a different expiry duration (e.g. 5 min instead of 1 hour).
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 size-1.5 rounded-full bg-foreground shrink-0 mt-1.5" />
                      The invite window has passed and you want to close access immediately.
                    </li>
                  </ul>
                </div>

                <div className="nb-flat bg-card p-3 flex items-start gap-2 border-urgent/60">
                  <span className="text-urgent font-bold text-xs uppercase tracking-wider shrink-0 mt-px">
                    Note
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Users who have already joined with the old code keep their access — only
                    future use of that code is revoked.
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </div>

          {/* Footer */}
          <AlertDialogFooter className="px-6 pb-5 gap-2">
            <AlertDialogCancel
              onClick={() => setShowOverrideDialog(false)}
              className="nb-sm font-semibold"
            >
              Keep existing code
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => generate(true)}
              className="nb-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold gap-2"
            >
              Invalidate & generate new
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <div className="nb space-y-4 p-5 bg-card">
        <div>
          <h3 className="font-display text-base uppercase flex items-center gap-2">
            <KeyRound className="size-4 text-primary" />
            Temporary Join Passcode (TOTP)
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Generate a time-limited passcode allowing anyone to join this project.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className="w-40 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 Minutes</SelectItem>
              <SelectItem value="60">1 Hour</SelectItem>
              <SelectItem value="360">6 Hours</SelectItem>
              <SelectItem value="1440">24 Hours</SelectItem>
            </SelectContent>
          </Select>

          <Button
            onClick={() => generate(false)}
            disabled={loading || loadingExisting}
            size="sm"
            className="nb-sm font-semibold gap-1.5"
          >
            <Sparkles className="size-3.5" />
            {loading ? "Generating…" : "Generate Passcode"}
          </Button>
        </div>

        {loadingExisting && (
          <div className="animate-pulse h-14 w-full rounded border-2 border-foreground/20 bg-foreground/10" />
        )}

        {!loadingExisting && activeCode && (
          <div className="nb-flat flex items-center justify-between gap-4 p-3 bg-secondary">
            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">Active Join Passcode</p>
              <p className="font-mono text-2xl font-black tracking-widest text-primary">{activeCode.code}</p>
              <p className="text-[0.7rem] text-muted-foreground mt-0.5">
                Expires at: {new Date(activeCode.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <Button onClick={copyCode} variant="outline" size="sm" className="nb-sm gap-1 text-xs">
              <Copy className="size-3.5" />
              Copy Code
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

// ── AI Configuration Card ─────────────────────────────────────────────────────
const AI_PROVIDERS = [
  { value: "openai",    label: "OpenAI",         hint: "GPT-4o-mini + text-embedding-3-small" },
  { value: "anthropic", label: "Anthropic",       hint: "Claude 3 Haiku" },
  { value: "google",   label: "Google Gemini",   hint: "Gemini 1.5 Flash + text-embedding-004" },
] as const;

function AIConfigCard({ projectId }: { projectId: string }) {
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  // Check if key is already set on mount
  useEffect(() => {
    graphqlRequest<{ projectHasAiKey: boolean }>(PROJECT_HAS_AI_KEY_QUERY, { projectId })
      .then((r) => setHasKey(r.projectHasAiKey))
      .catch(() => setHasKey(false));
  }, [projectId]);

  const handleSave = async () => {
    if (!apiKey.trim()) { toast.error("Enter an API key."); return; }
    setSaving(true);
    try {
      await graphqlRequest(SET_API_KEY_MUTATION, { projectId, provider, apiKey: apiKey.trim() });
      toast.success("AI API key saved. All project members can now use AI search.");
      setApiKey("");
      setHasKey(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save API key.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await graphqlRequest(REMOVE_API_KEY_MUTATION, { projectId });
      toast.success("AI API key removed.");
      setHasKey(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to remove API key.");
    } finally {
      setRemoving(false);
    }
  };

  const selectedProvider = AI_PROVIDERS.find((p) => p.value === provider);

  return (
    <div className="nb space-y-4 p-5 bg-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-base uppercase flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            AI Search Configuration
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add an LLM API key to enable AI-enhanced search for all project members.
            Keys are encrypted before storage and never returned to clients.
          </p>
        </div>
        {hasKey === true && (
          <span className="shrink-0 inline-flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-green-400 border border-green-500/40 bg-green-500/10 px-2 py-0.5 rounded-full">
            <span className="size-1.5 rounded-full bg-green-400 animate-pulse" />
            Key Configured
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 items-start">
        {/* Provider */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ai-provider" className="font-semibold text-sm">LLM Provider</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger id="ai-provider" className="h-10 w-full border-2 border-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_PROVIDERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[0.7rem] text-muted-foreground min-h-[1.25rem]">
            {selectedProvider?.hint ?? ""}
          </p>
        </div>

        {/* API Key */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ai-api-key" className="font-semibold text-sm">API Key</Label>
          <div className="relative w-full">
            <Input
              id="ai-api-key"
              type={showKey ? "text" : "password"}
              placeholder={hasKey ? "Enter new key to replace…" : "sk-…"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              className="h-10 border-2 border-foreground pr-10"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2.5 top-0 bottom-0 my-auto h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? (
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
              ) : (
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              )}
            </button>
          </div>
          <p className="text-[0.7rem] text-muted-foreground min-h-[1.25rem]">
            Encrypted with AES-256-GCM before storage
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          id="ai-save-key-btn"
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="nb-sm font-semibold gap-1.5"
        >
          <Sparkles className="size-3.5" />
          {saving ? "Saving…" : hasKey ? "Update Key" : "Save Key"}
        </Button>

        {hasKey && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                id="ai-remove-key-btn"
                size="sm"
                variant="ghost"
                disabled={removing}
                className="nb-sm font-semibold gap-1.5 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                {removing ? "Removing…" : "Remove Key"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display uppercase">Remove AI Key?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete the encrypted API key. AI search features will be disabled
                  for this project until a new key is configured.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleRemove}
                  className="bg-destructive text-destructive-foreground"
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
function MembersPage() {
  const { projectId } = Route.useParams() as { projectId: string };
  const project = useProject(projectId);
  const { ready, users, refetchData } = useTracker();
  const auth = useAuth();

  const myId = auth?.user?.id ?? "";

  // Members for this specific project (filtered from the store's deduplicated users)
  const projectMembers = users.filter((u) =>
    // users in the store come from project-level membership fetches
    // they all belong to at least one shared project with the current user
    u.id !== undefined
  );

  // Derive my role from the project (stored in project.myRole)
  const myRole: ProjectRole = (project?.myRole as ProjectRole) ?? "member";

  const canInvite = myRole === "owner" || myRole === "admin";

  if (!ready) {
    return <MembersSkeleton />;
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="font-display text-xl uppercase">Project not found</h1>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps">{project.key} · Project Members</p>
          <h1 className="mt-1 font-display text-3xl uppercase">{project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {projectMembers.length} member{projectMembers.length !== 1 ? "s" : ""} ·{" "}
            <span className="capitalize">{myRole}</span> access
          </p>
        </div>
        {canInvite && (
          <InviteDialog projectId={projectId} onSuccess={refetchData} />
        )}
      </header>

      {/* TOTP / Passcode Generator Card for Admins/Owners */}
      {canInvite && <GenerateJoinCodeCard projectId={projectId} />}

      {/* AI Configuration Card for Admins/Owners */}
      {canInvite && <AIConfigCard projectId={projectId} />}

      {/* Role legend */}
      <div className="nb-flat flex flex-wrap gap-6 p-4">
        <div className="flex items-center gap-2">
          <RoleBadge role="owner" />
          <span className="text-xs text-muted-foreground">Created the project, full control</span>
        </div>
        <div className="flex items-center gap-2">
          <RoleBadge role="admin" />
          <span className="text-xs text-muted-foreground">Can manage issues and invite/remove members</span>
        </div>
        <div className="flex items-center gap-2">
          <RoleBadge role="member" />
          <span className="text-xs text-muted-foreground">Can view members, cannot invite</span>
        </div>
      </div>

      {/* Member list */}
      <section className="space-y-3">
        {projectMembers.length === 0 ? (
          <div className="nb p-10 text-center text-muted-foreground">
            <p className="font-display text-lg uppercase">No members yet</p>
            <p className="mt-2 text-sm">Invite teammates to get started.</p>
          </div>
        ) : (
          projectMembers.map((u) => (
            <MemberCard
              key={u.id}
              member={u}
              projectId={projectId}
              myRole={myRole}
              isMe={u.id === myId}
              onUpdated={refetchData}
            />
          ))
        )}
      </section>
    </div>
  );
}
