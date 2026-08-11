import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Assignee } from "@/components/tracker/assignee";
import { LabelChip, PriorityChip, StatusChip } from "@/components/tracker/chips";
import { Button } from "@/components/ui/button";
import { useTracker } from "@/lib/tracker/store";
import { STATUSES } from "@/lib/tracker/types";
import { cn } from "@/lib/utils";

import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/assigned")({
  head: () => ({
    meta: [
      { title: "My Assigned Issues | Blockwork" },
      {
        name: "description",
        content: "Every issue assigned to you across all projects, grouped by status and priority.",
      },
      { property: "og:title", content: "My Assigned Issues | Blockwork" },
      {
        property: "og:description",
        content: "Every issue assigned to you across all projects, grouped by status and priority.",
      },
    ],
  }),
  component: AssignedPage,
});

function AssignedPage() {
  const { tickets, projects } = useTracker();
  const auth = useAuth();
  const myId = auth?.user?.id ?? "";
  const [status, setStatus] = useState<string>("open");

  const mine = tickets
    .filter((t) => t.assigneeId === myId)
    .filter((t) =>
      status === "open" ? t.status !== "done" : status === "all" ? true : t.status === status,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const filters = [
    { id: "open", label: "Open" },
    ...STATUSES.map((s) => ({ id: s.id as string, label: s.label })),
    { id: "all", label: "All" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10">
      <header className="space-y-3">
        <p className="label-caps">Across all projects</p>
        <h1 className="font-display text-4xl uppercase">My Assigned</h1>
        <p className="text-base text-muted-foreground">{mine.length} issues in this view.</p>
      </header>

      <div className="flex flex-wrap gap-3">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setStatus(f.id)}
            className={cn(
              "border-2 border-foreground px-4 py-2 text-xs font-bold uppercase tracking-wide transition-transform",
              status === f.id
                ? "bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
                : "bg-card hover:-translate-y-0.5",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ul className="space-y-4">
        {mine.map((t) => {
          const project = projects.find((p) => p.id === t.projectId);
          return (
            <li key={t.id} className="nb nb-hover flex flex-wrap items-center gap-4 p-5">
              <span className="font-mono text-xs font-bold text-muted-foreground">{t.key}</span>
              <Link
                to="/projects/$projectId/tickets/$ticketId"
                params={{ projectId: t.projectId, ticketId: t.id }}
                className="min-w-0 flex-1 text-base font-semibold hover:underline"
              >
                {t.title}
              </Link>
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                {project?.name}
              </span>
              {t.labels.map((l) => (
                <LabelChip key={l} label={l} />
              ))}
              <PriorityChip priority={t.priority} />
              <StatusChip status={t.status} />
              <Assignee id={t.assigneeId} />
            </li>
          );
        })}
        {mine.length === 0 && (
          <li className="border-2 border-dashed border-foreground/30 p-12 text-center text-sm text-muted-foreground">
            Nothing assigned in this view.{" "}
            <Button asChild variant="link" className="px-1">
              <Link to="/">Back home</Link>
            </Button>
          </li>
        )}
      </ul>
    </div>
  );
}
