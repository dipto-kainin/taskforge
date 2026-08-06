import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Equal } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Priority, Status } from "@/lib/tracker/types";
import { priorityLabel, statusLabel } from "@/lib/tracker/types";

const priorityStyles: Record<Priority, string> = {
  urgent: "bg-urgent text-urgent-foreground",
  high: "bg-high text-high-foreground",
  medium: "bg-medium text-medium-foreground",
  low: "bg-low text-low-foreground",
  lowest: "bg-low text-low-foreground",
};

const priorityIcons: Record<Priority, typeof ArrowUp> = {
  urgent: ChevronsUp,
  high: ArrowUp,
  medium: Equal,
  low: ArrowDown,
  lowest: ChevronsDown,
};

const statusStyles: Record<Status, string> = {
  backlog: "bg-muted text-muted-foreground",
  todo: "bg-low text-low-foreground",
  in_progress: "bg-progress text-progress-foreground",
  done: "bg-done text-done-foreground",
};

const base =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium leading-5";

export function PriorityChip({ priority, className }: { priority: Priority; className?: string | undefined }) {
  const Icon = priorityIcons[priority];
  return (
    <span className={cn(base, priorityStyles[priority], className)}>
      <Icon className="size-3" aria-hidden />
      {priorityLabel(priority)}
    </span>
  );
}

export function StatusChip({ status, className }: { status: Status; className?: string | undefined }) {
  return <span className={cn(base, statusStyles[status], className)}>{statusLabel(status)}</span>;
}

export function LabelChip({ label, className }: { label: string; className?: string | undefined }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-border bg-surface px-1.5 py-0.5 text-[0.6875rem] text-surface-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function UserAvatar({
  name,
  initials,
  className,
}: {
  name: string;
  initials: string;
  className?: string | undefined;
}) {
  return (
    <span
      title={name}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[0.625rem] font-semibold text-accent-foreground",
        className,
      )}
    >
      {initials}
    </span>
  );
}

export function UnassignedAvatar({ className }: { className?: string | undefined }) {
  return (
    <span
      title="Unassigned"
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-[0.625rem] text-muted-foreground",
        className,
      )}
    >
      ?
    </span>
  );
}
