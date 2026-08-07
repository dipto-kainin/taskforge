import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { ArrowUpDown, X } from "lucide-react";
import { z } from "zod";

import { Assignee } from "@/components/tracker/assignee";
import { LabelChip, PriorityChip, StatusChip } from "@/components/tracker/chips";
import { NewTicketDialog } from "@/components/tracker/new-ticket-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProject, useTracker } from "@/lib/tracker/store";
import { PRIORITIES, STATUSES, type Priority } from "@/lib/tracker/types";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  status: fallback(z.string(), "all").default("all"),
  priority: fallback(z.string(), "all").default("all"),
  assignee: fallback(z.string(), "all").default("all"),
  sort: fallback(z.string(), "created").default("created"),
});

export const Route = createFileRoute("/projects/$projectId/issues")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "All Issues | Blockwork" },
      {
        name: "description",
        content: "Search, filter and sort every issue in this project by status, priority and assignee.",
      },
      { property: "og:title", content: "All Issues | Blockwork" },
      {
        property: "og:description",
        content: "Search, filter and sort every issue in this project by status, priority and assignee.",
      },
    ],
  }),
  component: IssuesPage,
});

const priorityRank: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  lowest: 4,
};

function IssuesPage() {
  const { projectId } = Route.useParams();
  const { q, status, priority, assignee, sort } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const project = useProject(projectId);
  const { tickets, users } = useTracker();

  if (!project) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-semibold">Project not found</h1>
        <Button asChild className="mt-4">
          <Link to="/">Back home</Link>
        </Button>
      </div>
    );
  }

  const current = { q, status, priority, assignee, sort };
  const set = (patch: Partial<typeof current>) =>
    navigate({ search: { ...current, ...patch } });

  const query = q.trim().toLowerCase().slice(0, 100);
  const rows = tickets
    .filter((t) => t.projectId === projectId)
    .filter((t) => (status === "all" ? true : t.status === status))
    .filter((t) => (priority === "all" ? true : t.priority === priority))
    .filter((t) =>
      assignee === "all"
        ? true
        : assignee === "unassigned"
          ? t.assigneeId === null
          : t.assigneeId === assignee,
    )
    .filter(
      (t) =>
        !query ||
        t.title.toLowerCase().includes(query) ||
        t.key.toLowerCase().includes(query) ||
        t.labels.some((l) => l.toLowerCase().includes(query)),
    )
    .sort((a, b) => {
      if (sort === "priority") return priorityRank[a.priority] - priorityRank[b.priority];
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "status") return a.status.localeCompare(b.status);
      return b.createdAt.localeCompare(a.createdAt);
    });

  const filtered = q || status !== "all" || priority !== "all" || assignee !== "all";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-caps">{project.key} · Issues</p>
          <h1 className="mt-1 font-display text-3xl uppercase">All issues</h1>
        </div>
        <NewTicketDialog projectId={projectId} trigger={<Button size="sm">New issue</Button>} />
      </header>

      <div className="nb flex flex-wrap items-center gap-3 p-4">
        <Input
          value={q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search title, key or label"
          className="h-9 w-full sm:w-64"
        />
        <Select value={status} onValueChange={(v) => set({ status: v })}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={(v) => set({ priority: v })}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {PRIORITIES.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assignee} onValueChange={(v) => set({ assignee: v })}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Anyone</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => set({ sort: v })}>
          <SelectTrigger className="h-9 w-40">
            <ArrowUpDown className="size-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created">Newest first</SelectItem>
            <SelectItem value="priority">Priority</SelectItem>
            <SelectItem value="status">Status</SelectItem>
            <SelectItem value="title">Title A–Z</SelectItem>
          </SelectContent>
        </Select>
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => set({ q: "", status: "all", priority: "all", assignee: "all" })}
          >
            <X className="size-4" />
            Clear
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} issues</span>
      </div>

      <div className="nb overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Key</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead className="w-28">Priority</TableHead>
              <TableHead className="w-16 text-right">Owner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id} className="hover:bg-secondary">
                <TableCell className="font-mono text-xs text-muted-foreground">{t.key}</TableCell>
                <TableCell>
                  <Link
                    to="/projects/$projectId/tickets/$ticketId"
                    params={{ projectId, ticketId: t.id }}
                    className="font-medium hover:text-primary"
                  >
                    {t.title}
                  </Link>
                  {t.labels.length > 0 && (
                    <span className="ml-2 inline-flex gap-1">
                      {t.labels.map((l) => (
                        <LabelChip key={l} label={l} />
                      ))}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusChip status={t.status} />
                </TableCell>
                <TableCell>
                  <PriorityChip priority={t.priority} />
                </TableCell>
                <TableCell className="text-right">
                  <Assignee id={t.assigneeId} className="ml-auto" />
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No issues match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
