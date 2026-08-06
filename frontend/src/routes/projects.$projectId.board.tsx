import { Link, createFileRoute } from "@tanstack/react-router";

import { KanbanBoard } from "@/components/tracker/board";
import { Button } from "@/components/ui/button";
import { useProject, useTracker } from "@/lib/tracker/store";

export const Route = createFileRoute("/projects/$projectId/board")({
  head: () => ({
    meta: [
      { title: "Kanban board — Flightdeck" },
      {
        name: "description",
        content: "Drag tickets between backlog, to do, in progress and done on the kanban board.",
      },
      { property: "og:title", content: "Kanban board — Flightdeck" },
      {
        property: "og:description",
        content: "Drag tickets between backlog, to do, in progress and done.",
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
          <Link to="/">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  const open = tickets.filter((t) => t.projectId === projectId && t.status !== "done").length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-caps">{project.key} · Board</p>
          <h1 className="mt-1 text-2xl font-semibold">{project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{open} open tickets</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/projects/$projectId/backlog" params={{ projectId }}>
            Open backlog
          </Link>
        </Button>
      </header>
      <KanbanBoard projectId={projectId} />
    </div>
  );
}
