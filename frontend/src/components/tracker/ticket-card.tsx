import { Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Ticket } from "@/lib/tracker/types";
import { Assignee } from "./assignee";
import { LabelChip, PriorityChip } from "./chips";

export function TicketCard({
  ticket,
  commentCount,
  dragging,
  className,
}: {
  ticket: Ticket;
  commentCount: number;
  dragging?: boolean;
  className?: string | undefined;
}) {
  return (
    <article
      className={cn(
        "group rounded-lg border border-border bg-card p-3 transition-shadow",
        dragging ? "shadow-lg ring-2 ring-ring/40" : "hover:border-ring/40",
        className,
      )}
    >
      <Link
        to="/projects/$projectId/tickets/$ticketId"
        params={{ projectId: ticket.projectId, ticketId: ticket.id }}
        className="block text-sm font-medium leading-snug text-card-foreground hover:text-primary"
      >
        {ticket.title}
      </Link>
      {ticket.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {ticket.labels.map((l) => (
            <LabelChip key={l} label={l} />
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[0.6875rem] text-muted-foreground">{ticket.key}</span>
          <PriorityChip priority={ticket.priority} />
        </div>
        <div className="flex items-center gap-2">
          {commentCount > 0 && (
            <span className="flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
              <MessageSquare className="size-3" aria-hidden />
              {commentCount}
            </span>
          )}
          <Assignee id={ticket.assigneeId} />
        </div>
      </div>
    </article>
  );
}
