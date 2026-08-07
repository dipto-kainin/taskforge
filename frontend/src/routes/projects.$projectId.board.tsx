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

function BoardPage() {
  const { projectId } = Route.useParams();
  const project = useProject(projectId);
  const { tickets } = useTracker();

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
