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
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useTracker } from "@/lib/tracker/store";
import { STATUSES, type Status, type Ticket } from "@/lib/tracker/types";
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
    <section className="flex min-w-[15rem] flex-1 basis-0 flex-col rounded-xl bg-surface/70">
      <header className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="label-caps">{label}</h2>
          <span className="rounded-full bg-card px-1.5 text-[0.6875rem] text-muted-foreground">
            {tickets.length}
          </span>
        </div>
        <NewTicketDialog
          projectId={projectId}
          defaultStatus={status}
          trigger={
            <Button variant="ghost" size="icon" className="size-6" aria-label={`Add to ${label}`}>
              <Plus className="size-4" />
            </Button>
          }
        />
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-2 rounded-b-xl border border-transparent p-2 transition-colors",
          isOver && "border-ring/50 bg-accent/50",
        )}
      >
        <SortableContext items={tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tickets.map((t) => (
            <SortableTicket key={t.id} ticket={t} commentCount={countComments(t.id)} />
          ))}
        </SortableContext>
        {tickets.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Drop tickets here
          </p>
        )}
      </div>
    </section>
  );
}

export function KanbanBoard({ projectId }: { projectId: string }) {
  const { tickets, comments, moveTicket } = useTracker();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columns = useMemo(() => {
    const projectTickets = tickets.filter((t) => t.projectId === projectId);
    return STATUSES.map((s) => ({
      ...s,
      tickets: projectTickets
        .filter((t) => t.status === s.id)
        .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)),
    }));
  }, [tickets, projectId]);

  const countComments = (id: string) => comments.filter((c) => c.ticketId === id).length;
  const activeTicket = tickets.find((t) => t.id === activeId) ?? null;

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
      <div className="flex gap-3 overflow-x-auto pb-4">
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
            className="w-[17rem] rotate-2"
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
