import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CircleDot, MessageSquare } from "lucide-react";

import { Assignee } from "@/components/tracker/assignee";
import { PriorityChip, StatusChip } from "@/components/tracker/chips";
import { useTracker } from "@/lib/tracker/store";
import { STATUSES } from "@/lib/tracker/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Flightdeck Ticket Tracker" },
      {
        name: "description",
        content:
          "See every project at a glance: open work, progress, priority mix and the latest ticket activity.",
      },
      { property: "og:title", content: "Dashboard — Flightdeck Ticket Tracker" },
      {
        property: "og:description",
        content: "See every project at a glance: open work, progress and recent activity.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { projects, tickets, comments } = useTracker();

  const totals = STATUSES.map((s) => ({
    ...s,
    count: tickets.filter((t) => t.status === s.id).length,
  }));

  const recent = [...tickets]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <header>
        <p className="label-caps">Overview</p>
        <h1 className="mt-1 text-3xl font-semibold">Your work, at a glance</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {tickets.length} tickets across {projects.length} projects. Everything is stored locally in
          this browser, so feel free to move things around.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {totals.map((t) => (
          <div key={t.id} className="rounded-xl border border-border bg-card p-4">
            <p className="label-caps">{t.label}</p>
            <p className="mt-2 font-display text-3xl font-semibold">{t.count}</p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Projects</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {projects.map((project) => {
            const list = tickets.filter((t) => t.projectId === project.id);
            const done = list.filter((t) => t.status === "done").length;
            const pct = list.length ? Math.round((done / list.length) * 100) : 0;
            return (
              <Link
                key={project.id}
                to="/projects/$projectId/board"
                params={{ projectId: project.id }}
                className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-ring/50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">{project.key}</span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <h3 className="mt-2 text-base font-semibold">{project.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {project.description}
                </p>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {done} of {list.length} done
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {STATUSES.filter((s) => s.id !== "done").map((s) => (
                    <StatusChip key={s.id} status={s.id} />
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {recent.map((t) => (
            <li key={t.id}>
              <Link
                to="/projects/$projectId/tickets/$ticketId"
                params={{ projectId: t.projectId, ticketId: t.id }}
                className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-surface"
              >
                <CircleDot className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="font-mono text-xs text-muted-foreground">{t.key}</span>
                <span className="truncate">{t.title}</span>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  {comments.filter((c) => c.ticketId === t.id).length > 0 && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageSquare className="size-3" />
                      {comments.filter((c) => c.ticketId === t.id).length}
                    </span>
                  )}
                  <PriorityChip priority={t.priority} />
                  <StatusChip status={t.status} />
                  <Assignee id={t.assigneeId} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
