import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Crown, Shield, User as UserIcon, UserMinus, UserPlus } from "lucide-react";
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
import type { OrgRole, User } from "@/lib/tracker/types";

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

// ── GraphQL mutations ────────────────────────────────────────────
const INVITE_MUTATION = `
  mutation InviteToOrg($orgId: ID!, $email: String!, $role: String) {
    inviteToOrg(orgId: $orgId, email: $email, role: $role) {
      message
      role
    }
  }
`;

const REMOVE_MUTATION = `
  mutation RemoveFromOrg($orgId: ID!, $userId: ID!) {
    removeFromOrg(orgId: $orgId, userId: $userId)
  }
`;

const UPDATE_ROLE_MUTATION = `
  mutation UpdateMemberRole($orgId: ID!, $userId: ID!, $role: String!) {
    updateMemberRole(orgId: $orgId, userId: $userId, role: $role) {
      id
      role
    }
  }
`;

// ── Role metadata ────────────────────────────────────────────────
const ROLE_META: Record<OrgRole, { label: string; icon: typeof Crown; color: string }> = {
  owner: { label: "Owner", icon: Crown, color: "bg-urgent text-urgent-foreground" },
  admin: { label: "Admin", icon: Shield, color: "bg-progress text-progress-foreground" },
  member: { label: "Member", icon: UserIcon, color: "bg-secondary text-secondary-foreground" },
};

function RoleBadge({ role }: { role: OrgRole }) {
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

// ── Invite Dialog ────────────────────────────────────────────────
function InviteDialog({ orgId, onSuccess }: { orgId: string; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("member");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim()) {
      toast.error("Enter an email address.");
      return;
    }
    setLoading(true);
    try {
      await graphqlRequest(INVITE_MUTATION, { orgId, email: email.trim(), role });
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
            <Select value={role} onValueChange={(v) => setRole(v as OrgRole)}>
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

// ── Member Card ──────────────────────────────────────────────────
function MemberCard({
  member,
  orgId,
  myRole,
  isMe,
  onUpdated,
}: {
  member: User;
  orgId: string;
  myRole: OrgRole;
  isMe: boolean;
  onUpdated: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const memberRole = (member.role ?? "member") as OrgRole;

  const canRemove =
    !isMe &&
    (myRole === "owner" ||
      (myRole === "admin" && memberRole === "member"));

  const canChangeRole = myRole === "owner" && !isMe;

  const handleRemove = async () => {
    setLoading(true);
    try {
      await graphqlRequest(REMOVE_MUTATION, { orgId, userId: member.id });
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
      await graphqlRequest(UPDATE_ROLE_MUTATION, { orgId, userId: member.id, role: newRole });
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

// ── Page ─────────────────────────────────────────────────────────
function MembersPage() {
  const { projectId } = Route.useParams() as { projectId: string };
  const project = useProject(projectId);
  const { users, refetchData } = useTracker();
  const auth = useAuth();

  const orgId = project?.orgId ?? "";
  const myId = auth?.user?.id ?? "";

  // Derive my role from the users list (populated from orgMembers query)
  const me = users.find((u) => u.id === myId);
  const myRole: OrgRole = (me?.role as OrgRole) ?? "member";

  const canInvite = myRole === "owner" || myRole === "admin";

  if (!project) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="font-display text-xl uppercase">Project not found</h1>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-10">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps">{project.key} · Project Members</p>
          <h1 className="mt-1 font-display text-3xl uppercase">{project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {users.length} member{users.length !== 1 ? "s" : ""} ·{" "}
            <span className="capitalize">{myRole}</span> access
          </p>
        </div>
        {canInvite && orgId && (
          <InviteDialog orgId={orgId} onSuccess={refetchData} />
        )}
      </header>

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
        {users.length === 0 ? (
          <div className="nb p-10 text-center text-muted-foreground">
            <p className="font-display text-lg uppercase">No members yet</p>
            <p className="mt-2 text-sm">Invite teammates to get started.</p>
          </div>
        ) : (
          users.map((u) => (
            <MemberCard
              key={u.id}
              member={u}
              orgId={orgId}
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
