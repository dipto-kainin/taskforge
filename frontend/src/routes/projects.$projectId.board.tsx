import { Link, createFileRoute } from "@tanstack/react-router";

import { KanbanBoard } from "@/components/tracker/board";
import { Button } from "@/components/ui/button";
import { useProject, useTracker } from "@/lib/tracker/store";

export const Route = createFileRoute("/projects/$projectId/board")({
  head: () => ({
    meta: [
      { title: "Kanban Board | Blockwork" },
      {
        name: "description",
        content: "Drag issues between backlog, to do, in progress and in review, and reveal completed work.",
      },
      { property: "og:title", content: "Kanban Board | Blockwork" },
      {
        property: "og:description",
        content: "Drag issues across the board and reveal completed work.",
      },
    ],
  }),
  component: BoardPage,
});

function BoardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 animate-pulse">
      {/* Header skeleton */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-foreground/20" />
          <div className="h-8 w-56 rounded bg-foreground/30" />
          <div className="h-3 w-32 rounded bg-foreground/15" />
        </div>
        <div className="h-9 w-24 rounded border-2 border-foreground/25 bg-foreground/15" />
      </header>

      {/* Kanban columns skeleton */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {["Backlog", "To Do", "In Progress", "In Review", "Done"].map((col) => (
          <div
            key={col}
            className="min-w-[260px] flex-shrink-0 space-y-3 rounded border-2 border-foreground/20 bg-card p-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-20 rounded bg-foreground/25" />
              <div className="h-5 w-5 rounded bg-foreground/20" />
            </div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="nb-sm space-y-2 p-3 bg-background border-foreground/30">
                <div className="h-3 w-3/4 rounded bg-foreground/25" />
                <div className="h-3 w-1/2 rounded bg-foreground/20" />
                <div className="flex items-center justify-between mt-2">
                  <div className="h-4 w-16 rounded-full bg-foreground/20" />
                  <div className="size-5 rounded-full bg-foreground/25" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function BoardPage() {
  const { projectId } = Route.useParams();
  const { ready, tickets } = useTracker();
  const project = useProject(projectId);

  // While data is loading, show skeleton — never flash "Project not found"
  if (!ready) {
    return <BoardSkeleton />;
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

  const open = tickets.filter((t) => t.projectId === projectId && t.status !== "done").length;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-caps">{project.key} · Kanban</p>
          <h1 className="mt-1 font-display text-3xl uppercase">{project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{open} open issues</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/projects/$projectId/issues" params={{ projectId }}>
            All issues
          </Link>
        </Button>
      </header>
      <KanbanBoard projectId={projectId} />
    </div>
  );
}
