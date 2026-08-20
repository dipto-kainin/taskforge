import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Assignee } from "@/components/tracker/assignee";
import { LabelChip, PriorityChip } from "@/components/tracker/chips";
import { NewTicketDialog } from "@/components/tracker/new-ticket-dialog";
import { Button } from "@/components/ui/button";
import { useProject, useTracker } from "@/lib/tracker/store";
import { type Priority } from "@/lib/tracker/types";

export const Route = createFileRoute("/projects/$projectId/backlog")({
  head: () => ({
    meta: [
      { title: "Backlog | Blockwork" },
      {
        name: "description",
        content: "Groom the backlog: unscheduled issues ordered by priority, ready to promote to To Do.",
      },
      { property: "og:title", content: "Backlog | Blockwork" },
      {
        property: "og:description",
        content: "Unscheduled issues ordered by priority, ready to promote to To Do.",
      },
    ],
  }),
  component: BacklogPage,
});

const rank: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, lowest: 4 };

function BacklogSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 animate-pulse">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-foreground/20" />
          <div className="h-8 w-48 rounded bg-foreground/30" />
          <div className="h-3 w-40 rounded bg-foreground/15" />
        </div>
        <div className="h-9 w-24 rounded border-2 border-foreground/25 bg-foreground/15" />
      </header>
      <ul className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <li key={i} className="nb flex flex-wrap items-center gap-4 p-5 border-foreground/30">
            <div className="h-3 w-16 rounded bg-foreground/20" />
            <div className="h-5 flex-1 rounded bg-foreground/30" />
            <div className="h-5 w-16 rounded-full bg-foreground/20" />
            <div className="size-7 rounded-full bg-foreground/25" />
            <div className="h-8 w-20 rounded border-2 border-foreground/25 bg-foreground/15" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function BacklogPage() {
  const { projectId } = Route.useParams();
  const { ready, tickets, updateTicket } = useTracker();
  const project = useProject(projectId);

  if (!ready) {
    return <BacklogSkeleton />;
  }

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

  const rows = tickets
    .filter((t) => t.projectId === projectId && t.status === "backlog")
    .sort((a, b) => rank[a.priority] - rank[b.priority]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-caps">{project.key} · Backlog</p>
          <h1 className="mt-1 font-display text-3xl uppercase">Backlog</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {rows.length} unscheduled issues, highest priority first.
          </p>
        </div>
        <NewTicketDialog
          projectId={projectId}
          defaultStatus="backlog"
          trigger={<Button size="sm">New issue</Button>}
        />
      </header>

      <ul className="space-y-4">
        {rows.map((t) => (
          <li key={t.id} className="nb nb-hover flex flex-wrap items-center gap-4 p-5">
            <span className="font-mono text-xs font-bold text-muted-foreground">{t.key}</span>
            <Link
              to="/projects/$projectId/tickets/$ticketId"
              params={{ projectId, ticketId: t.id }}
              className="min-w-0 flex-1 text-base font-semibold hover:underline"
            >
              {t.title}
            </Link>
            {t.labels.map((l) => (
              <LabelChip key={l} label={l} />
            ))}
            <PriorityChip priority={t.priority} />
            <Assignee id={t.assigneeId} />
            <Button size="sm" variant="outline" onClick={() => updateTicket(t.id, { status: "todo" })}>
              To Do
              <ArrowRight className="size-4" />
            </Button>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="border-2 border-dashed border-foreground/30 p-12 text-center text-sm text-muted-foreground">
            The backlog is empty.
          </li>
        )}
      </ul>
    </div>
  );
}
