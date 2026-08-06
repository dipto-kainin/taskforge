import { Link, createFileRoute } from "@tanstack/react-router";
import { Check, CircleDashed } from "lucide-react";

import { Assignee } from "@/components/tracker/assignee";
import { PriorityChip, StatusChip } from "@/components/tracker/chips";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CURRENT_USER_ID, useProject, useTracker } from "@/lib/tracker/store";

export const Route = createFileRoute("/projects/$projectId/todos")({
  head: () => ({
    meta: [
      { title: "My todos — Flightdeck" },
      {
        name: "description",
        content: "A focused checklist of the tickets assigned to you in this project.",
      },
      { property: "og:title", content: "My todos — Flightdeck" },
      {
        property: "og:description",
        content: "A focused checklist of the tickets assigned to you in this project.",
      },
    ],
  }),
  component: TodosPage,
});

function TodosPage() {
  const { projectId } = Route.useParams();
  const project = useProject(projectId);
  const { tickets, updateTicket } = useTracker();

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

  const mine = tickets
    .filter((t) => t.projectId === projectId && t.assigneeId === CURRENT_USER_ID)
    .sort((a, b) => Number(a.status === "done") - Number(b.status === "done"));
  const openCount = mine.filter((t) => t.status !== "done").length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-caps">{project.key} · Todos</p>
          <h1 className="mt-1 text-2xl font-semibold">My todos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {openCount} open · {mine.length - openCount} completed
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/projects/$projectId/board" params={{ projectId }}>
            Open board
          </Link>
        </Button>
      </header>

      {mine.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <CircleDashed className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing assigned to you in this project yet.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {mine.map((ticket) => {
            const done = ticket.status === "done";
            return (
              <li key={ticket.id} className="flex items-center gap-3 px-4 py-3">
                <Checkbox
                  checked={done}
                  aria-label={done ? `Reopen ${ticket.key}` : `Complete ${ticket.key}`}
                  onCheckedChange={(next) =>
                    updateTicket(ticket.id, { status: next ? "done" : "todo" })
                  }
                />
                <Link
                  to="/projects/$projectId/tickets/$ticketId"
                  params={{ projectId, ticketId: ticket.id }}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <span className="font-mono text-[0.625rem] text-muted-foreground">
                    {ticket.key}
                  </span>
                  <span
                    className={`truncate text-sm ${done ? "text-muted-foreground line-through" : ""}`}
                  >
                    {ticket.title}
                  </span>
                </Link>
                <PriorityChip priority={ticket.priority} className="hidden sm:inline-flex" />
                <StatusChip status={ticket.status} className="hidden md:inline-flex" />
                <Assignee id={ticket.assigneeId} className="hidden lg:flex" />
                {done && <Check className="size-4 text-muted-foreground" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
