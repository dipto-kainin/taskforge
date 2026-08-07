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
        "nb-sm p-4",
        dragging ? "rotate-2 shadow-[8px_8px_0_0_var(--color-foreground)]" : "nb-hover",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[0.6875rem] font-bold tracking-wider text-muted-foreground">
          {ticket.key}
        </span>
        <PriorityChip priority={ticket.priority} />
      </div>
      <Link
        to="/projects/$projectId/tickets/$ticketId"
        params={{ projectId: ticket.projectId, ticketId: ticket.id }}
        className="mt-3 block text-sm font-semibold leading-snug hover:underline"
      >
        {ticket.title}
      </Link>
      {ticket.labels.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ticket.labels.map((l) => (
            <LabelChip key={l} label={l} />
          ))}
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-2 border-t-2 border-foreground/15 pt-3">
        <span className="flex items-center gap-1 text-[0.6875rem] font-medium text-muted-foreground">
          {commentCount > 0 && (
            <>
              <MessageSquare className="size-3.5" aria-hidden />
              {commentCount}
            </>
          )}
        </span>
        <Assignee id={ticket.assigneeId} />
      </div>
    </article>
  );
}
