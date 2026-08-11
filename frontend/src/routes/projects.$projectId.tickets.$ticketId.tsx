import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Assignee } from "@/components/tracker/assignee";
import { LabelChip } from "@/components/tracker/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useProject, useTracker } from "@/lib/tracker/store";
import { useAuth } from "@/lib/auth-context";
import { PRIORITIES, STATUSES, type Priority, type Status } from "@/lib/tracker/types";

export const Route = createFileRoute("/projects/$projectId/tickets/$ticketId")({
  head: () => ({
    meta: [
      { title: "Issue Details | Blockwork" },
      {
        name: "description",
        content: "Edit the issue: description, status, priority, assignee and the discussion thread.",
      },
      { property: "og:title", content: "Issue Details | Blockwork" },
      {
        property: "og:description",
        content: "Edit the issue and discuss it with your team.",
      },
    ],
  }),
  component: TicketPage,
});

function TicketPage() {
  const { projectId, ticketId } = Route.useParams();
  const navigate = useNavigate();
  const project = useProject(projectId);
  const { tickets, comments, users, updateTicket, deleteTicket, addComment } = useTracker();
  const auth = useAuth();
  const ticket = tickets.find((t) => t.id === ticketId) ?? null;

  const [draft, setDraft] = useState("");
  const [labelDraft, setLabelDraft] = useState("");
  const [editingLabels, setEditingLabels] = useState(false);

  if (!ticket || !project) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-semibold">Issue not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">This issue no longer exists.</p>
        <Button asChild className="mt-4">
          <Link to="/">Back home</Link>
        </Button>
      </div>
    );
  }

  const thread = comments
    .filter((c) => c.ticketId === ticket.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const postComment = () => {
    if (!draft.trim()) return;
    addComment(ticket.id, draft, auth?.user?.id ?? "");
    setDraft("");
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/projects/$projectId/board" params={{ projectId }}>
            <ArrowLeft className="size-4" />
            {project.name}
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            deleteTicket(ticket.id);
            toast.success(`Struck ${ticket.key} from the rolls`);
            navigate({ to: "/projects/$projectId/board", params: { projectId } });
          }}
        >
          <Trash2 className="size-4" />
          Burn scroll
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
        <div className="space-y-6">
          <div>
            <p className="font-mono text-xs text-muted-foreground">{ticket.key}</p>
            <input
              value={ticket.title}
              onChange={(e) => updateTicket(ticket.id, { title: e.target.value })}
              className="mt-1 w-full rounded-md border border-transparent bg-transparent px-2 py-1 font-display text-2xl font-semibold outline-none transition-colors hover:border-border focus:border-ring"
              aria-label="Issue title"
            />
          </div>

          <section className="space-y-2">
            <h2 className="label-caps">Contract terms</h2>
            <Textarea
              value={ticket.description}
              onChange={(e) => updateTicket(ticket.id, { description: e.target.value })}
              rows={5}
              placeholder="Terms, reward, known dangers…"
            />
          </section>

          <section className="space-y-3">
            <h2 className="label-caps">Comments · {thread.length}</h2>
            <ul className="space-y-3">
              {thread.map((c) => {
                const author = users.find((u) => u.id === c.authorId);
                return (
                  <li key={c.id} className="flex gap-3 rounded-sm border border-border bg-surface/60 p-3">
                    <Assignee id={c.authorId} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {author?.name ?? "Someone"}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {format(new Date(c.createdAt), "MMM d, HH:mm")}
                        </span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                        {c.body}
                      </p>
                    </div>
                  </li>
                );
              })}
              {thread.length === 0 && (
                <li className="rounded-sm border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  No notes pinned to this contract yet.
                </li>
              )}
            </ul>
            <div className="space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                placeholder="Leave a comment…"
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={postComment}>
                  Post note
                </Button>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-4 rounded-sm border border-border bg-surface/60 p-4">
          <div className="space-y-1.5">
            <Label>Pillar</Label>
            <Select
              value={ticket.status}
              onValueChange={(v) => updateTicket(ticket.id, { status: v as Status })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Skulls of danger</Label>
            <Select
              value={ticket.priority}
              onValueChange={(v) => updateTicket(ticket.id, { priority: v as Priority })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Assignee</Label>
            <Select
              value={ticket.assigneeId ?? "unassigned"}
              onValueChange={(v) =>
                updateTicket(ticket.id, { assigneeId: v === "unassigned" ? null : v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unclaimed</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Tags</Label>
            {editingLabels ? (
              <div className="flex gap-2">
                <Input
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  placeholder="beast, escort"
                  className="h-9"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    updateTicket(ticket.id, {
                      labels: labelDraft
                        .split(",")
                        .map((l) => l.trim())
                        .filter(Boolean),
                    });
                    setEditingLabels(false);
                  }}
                >
                  Save
                </Button>
              </div>
            ) : (
              <button
                className="flex w-full flex-wrap gap-1 rounded-md border border-transparent px-1 py-1 text-left hover:border-border"
                onClick={() => {
                  setLabelDraft(ticket.labels.join(", "));
                  setEditingLabels(true);
                }}
              >
                {ticket.labels.length ? (
                  ticket.labels.map((l) => <LabelChip key={l} label={l} />)
                ) : (
                  <span className="text-sm text-muted-foreground">Add labels</span>
                )}
              </button>
            )}
          </div>

          <dl className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <dt>Created</dt>
              <dd>{format(new Date(ticket.createdAt), "MMM d, yyyy")}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Updated</dt>
              <dd>{format(new Date(ticket.updatedAt), "MMM d, yyyy")}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
