import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckCircle2, ChevronDown, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useTracker } from "@/lib/tracker/store";
import { BOARD_STATUSES, type Status, type Ticket } from "@/lib/tracker/types";
import { cn } from "@/lib/utils";
import { NewTicketDialog } from "./new-ticket-dialog";
import { TicketCard } from "./ticket-card";

function SortableTicket({ ticket, commentCount }: { ticket: Ticket; commentCount: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
    data: { status: ticket.status },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("touch-none", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      <TicketCard ticket={ticket} commentCount={commentCount} />
    </div>
  );
}

function Column({
  status,
  label,
  tickets,
  projectId,
  countComments,
}: {
  status: Status;
  label: string;
  tickets: Ticket[];
  projectId: string;
  countComments: (id: string) => number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}`, data: { status } });

  return (
    <section className="flex min-w-[15rem] flex-1 basis-0 flex-col">
      <header className="nb-flat flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xs uppercase tracking-wider">{label}</h2>
          <span className="border-2 border-foreground bg-secondary px-1.5 text-[0.6875rem] font-bold">
            {tickets.length}
          </span>
        </div>
        <NewTicketDialog
          projectId={projectId}
          defaultStatus={status}
          trigger={
            <Button variant="ghost" size="icon" className="size-6" aria-label={`New issue in ${label}`}>
              <Plus className="size-4" />
            </Button>
          }
        />
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-40 flex-1 flex-col gap-4 border-2 border-t-0 border-dashed border-foreground/30 p-3 transition-colors",
          isOver && "border-solid border-foreground bg-accent/30",
        )}
      >
        <SortableContext items={tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tickets.map((t) => (
            <SortableTicket key={t.id} ticket={t} commentCount={countComments(t.id)} />
          ))}
        </SortableContext>
        {tickets.length === 0 && (
          <p className="border-2 border-dashed border-foreground/25 p-6 text-center text-xs font-medium text-muted-foreground">
            Drop an issue here
          </p>
        )}
      </div>
    </section>
  );
}

export function KanbanBoard({ projectId }: { projectId: string }) {
  const { tickets, comments, moveTicket } = useTracker();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columns = useMemo(() => {
    const projectTickets = tickets.filter((t) => t.projectId === projectId);
    return BOARD_STATUSES.map((s) => ({
      ...s,
      tickets: projectTickets
        .filter((t) => t.status === s.id)
        .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)),
    }));
  }, [tickets, projectId]);

  const countComments = (id: string) => comments.filter((c) => c.ticketId === id).length;
  const activeTicket = tickets.find((t) => t.id === activeId) ?? null;
  const completed = tickets
    .filter((t) => t.projectId === projectId && t.status === "done")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const onDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    const activeTicketId = String(active.id);

    let targetStatus: Status | null = null;
    let index = 0;

    if (overId.startsWith("column:")) {
      targetStatus = overId.slice("column:".length) as Status;
      index = columns.find((c) => c.id === targetStatus)?.tickets.length ?? 0;
    } else {
      const overTicket = tickets.find((t) => t.id === overId);
      if (!overTicket) return;
      targetStatus = overTicket.status;
      const column = columns.find((c) => c.id === targetStatus)?.tickets ?? [];
      index = column.findIndex((t) => t.id === overId);
      if (index < 0) index = column.length;
    }
    if (targetStatus) moveTicket(activeTicketId, targetStatus, index);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-4 overflow-x-auto pb-2">
        {columns.map((c) => (
          <Column
            key={c.id}
            status={c.id}
            label={c.label}
            tickets={c.tickets}
            projectId={projectId}
            countComments={countComments}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTicket && (
          <TicketCard
            ticket={activeTicket}
            commentCount={countComments(activeTicket.id)}
            dragging
            className="w-[17rem]"
          />
        )}
      </DragOverlay>

      <div className="mt-8">
        <Button
          variant="outline"
          onClick={() => setShowDone((v) => !v)}
          className="gap-2"
          aria-expanded={showDone}
        >
          <CheckCircle2 className="size-4" />
          {showDone ? "Hide" : "Show"} completed ({completed.length})
          <ChevronDown className={cn("size-4 transition-transform", showDone && "rotate-180")} />
        </Button>
        {showDone && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {completed.map((t) => (
              <TicketCard key={t.id} ticket={t} commentCount={countComments(t.id)} />
            ))}
            {completed.length === 0 && (
              <p className="border-2 border-dashed border-foreground/25 p-6 text-sm text-muted-foreground">
                Nothing completed yet.
              </p>
            )}
          </div>
        )}
      </div>
    </DndContext>
  );
}
