import { cn } from "@/lib/utils";
import type { Priority, Status } from "@/lib/tracker/types";
import { priorityLabel, statusLabel } from "@/lib/tracker/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const priorityStyles: Record<Priority, string> = {
  urgent: "bg-urgent text-urgent-foreground",
  high: "bg-high text-high-foreground",
  medium: "bg-medium text-medium-foreground",
  low: "bg-low text-low-foreground",
  lowest: "bg-muted text-foreground",
};

const statusStyles: Record<Status, string> = {
  backlog: "bg-muted text-foreground",
  todo: "bg-medium text-medium-foreground",
  in_progress: "bg-progress text-progress-foreground",
  in_review: "bg-accent text-accent-foreground",
  done: "bg-done text-done-foreground",
};

const base =
  "inline-flex items-center gap-1 border-2 border-foreground rounded-md px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide leading-5";

export function PriorityChip({
  priority,
  className,
}: {
  priority: Priority;
  className?: string | undefined;
}) {
  return (
    <span className={cn(base, priorityStyles[priority], className)}>{priorityLabel(priority)}</span>
  );
}

export function StatusChip({ status, className }: { status: Status; className?: string | undefined }) {
  return <span className={cn(base, statusStyles[status], className)}>{statusLabel(status)}</span>;
}

export function LabelChip({ label, className }: { label: string; className?: string | undefined }) {
  return (
    <span
      className={cn(
        "inline-flex items-center border-2 border-foreground bg-secondary rounded-md px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-foreground",
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
  avatarUrl,
  className,
}: {
  name: string;
  initials: string;
  avatarUrl?: string | null | undefined;
  className?: string | undefined;
}) {
  return (
    <Avatar title={name} className={cn("size-7 shrink-0 border-2 border-foreground", className)}>
      <AvatarImage src={avatarUrl ?? undefined} alt={name} />
      <AvatarFallback className="bg-accent text-[0.625rem] font-bold text-accent-foreground">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

export function UnassignedAvatar({ className }: { className?: string | undefined }) {
  return (
    <span
      title="Unassigned"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center border-2 border-dashed border-foreground/50 text-[0.625rem] font-bold text-muted-foreground",
        className,
      )}
    >
      ?
    </span>
  );
}
