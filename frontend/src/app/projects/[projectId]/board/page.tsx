"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useSubscription } from "@apollo/client/react";
import { useParams, useRouter } from "next/navigation";
import {
  DndContext, closestCenter, DragEndEvent,
  PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Navbar from "@/components/Navbar";
import { GET_BOARD, UPDATE_ISSUE, CREATE_ISSUE, NOTIFICATION_SUBSCRIPTION } from "@/lib/graphql";

interface Issue {
  id: string; key: string; title: string; type: string;
  status: string; priority: string; assigneeId?: string;
  columnId: string; storyPoints?: number;
  labels?: { id: string; name: string; color: string }[];
}

interface Column {
  id: string; name: string; position: number; issues: Issue[];
}

function PriorityBadge({ priority }: { priority: string }) {
  const cls = `priority-${priority}`;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cls}`}>
      {priority}
    </span>
  );
}

function TypeIcon({ type }: { type: string }) {
  const colors: Record<string, string> = {
    bug: "#ef4444", task: "#3b82f6", story: "#22c55e", epic: "#a855f7",
  };
  return (
    <span className="w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-bold text-white"
      style={{ background: colors[type] || "#6366f1" }}>
      {type[0]?.toUpperCase()}
    </span>
  );
}

function SortableIssueCard({ issue, onClick }: { issue: Issue; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
    data: { type: "issue", issue },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      onClick={onClick}
      className="glass rounded-lg p-3 mb-2 card-hover cursor-pointer group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <TypeIcon type={issue.type} />
          <span className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>{issue.key}</span>
        </div>
        <PriorityBadge priority={issue.priority} />
      </div>
      <p className="text-sm font-medium leading-snug mb-2" style={{ color: "var(--text-primary)" }}>
        {issue.title}
      </p>
      <div className="flex items-center justify-between">
        <div className="flex gap-1 flex-wrap">
          {issue.labels?.map((label) => (
            <span key={label.id} className="text-[10px] px-1.5 py-0.5 rounded-full border"
              style={{ color: label.color, borderColor: label.color + "40", background: label.color + "15" }}>
              {label.name}
            </span>
          ))}
        </div>
        {issue.storyPoints && (
          <span className="text-[10px] w-5 h-5 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center"
            style={{ color: "var(--text-muted)" }}>
            {issue.storyPoints}
          </span>
        )}
      </div>
    </div>
  );
}

function KanbanColumn({ column, onIssueClick }: { column: Column; onIssueClick: (id: string) => void }) {
  const columnColors: Record<string, string> = {
    "Backlog": "#64748b", "To Do": "#3b82f6", "In Progress": "#f59e0b", "Done": "#22c55e",
  };
  const color = columnColors[column.name] || "#6366f1";

  return (
    <div className="flex-shrink-0 w-72">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="w-2 h-2 rounded-full" style={{ background: color }} />
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{column.name}</h3>
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--bg-tertiary)]" style={{ color: "var(--text-muted)" }}>
          {column.issues.length}
        </span>
      </div>
      <div className="min-h-[200px] p-1 rounded-xl" style={{ background: "rgba(10,10,15,0.3)" }}>
        <SortableContext items={column.issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {column.issues.map((issue) => (
            <SortableIssueCard key={issue.id} issue={issue} onClick={() => onIssueClick(issue.id)} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

export default function BoardPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const { data, loading, refetch } = useQuery(GET_BOARD, { variables: { projectId } }) as any;
  const [updateIssue] = useMutation(UPDATE_ISSUE);
  const [createIssue] = useMutation(CREATE_ISSUE);
  const [columns, setColumns] = useState<Column[]>([]);
  const [showNewIssue, setShowNewIssue] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("task");
  const [newPriority, setNewPriority] = useState("medium");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    if (data?.board?.columns) {
      setColumns(data.board.columns);
    }
  }, [data]);

  // Real-time updates via WebSocket subscription
  useSubscription(NOTIFICATION_SUBSCRIPTION, {
    variables: { projectId },
    onData: () => {
      // Refetch board data when any notification arrives for this project
      refetch();
    },
  });

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const issueId = active.id as string;

    // Find which column the issue was dropped into
    let targetColumnId: string | null = null;
    for (const col of columns) {
      if (col.id === over.id || col.issues.some((i) => i.id === over.id)) {
        targetColumnId = col.id;
        break;
      }
    }

    if (!targetColumnId) return;

    // Optimistic update
    setColumns((prev) => {
      const updated = prev.map((col) => ({
        ...col,
        issues: col.issues.filter((i) => i.id !== issueId),
      }));
      const issue = prev.flatMap((c) => c.issues).find((i) => i.id === issueId);
      if (issue) {
        const targetCol = updated.find((c) => c.id === targetColumnId);
        if (targetCol) {
          targetCol.issues.push({ ...issue, columnId: targetColumnId! });
        }
      }
      return updated;
    });

    // Persist to backend
    const statusMap: Record<string, string> = {};
    columns.forEach((c) => {
      if (c.name === "Backlog") statusMap[c.id] = "backlog";
      else if (c.name === "To Do") statusMap[c.id] = "todo";
      else if (c.name === "In Progress") statusMap[c.id] = "in_progress";
      else if (c.name === "Done") statusMap[c.id] = "done";
    });

    try {
      await updateIssue({
        variables: {
          id: issueId,
          input: { columnId: targetColumnId, status: statusMap[targetColumnId] || "backlog" },
        },
      });
    } catch (err) {
      refetch(); // Revert on failure
    }
  };

  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await createIssue({
      variables: {
        input: { projectId, title: newTitle, type: newType, priority: newPriority },
      },
    });
    setShowNewIssue(false);
    setNewTitle("");
    refetch();
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse-glow w-10 h-10 rounded-lg bg-[var(--accent)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      <Navbar />
      <div className="px-4 sm:px-6 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/dashboard")}
              className="text-sm px-2 py-1 rounded hover:bg-[var(--bg-tertiary)] transition-all cursor-pointer"
              style={{ color: "var(--text-muted)" }}>
              ← Back
            </button>
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
              {data?.board?.name || "Board"}
            </h1>
          </div>
          <button onClick={() => setShowNewIssue(true)}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-sm font-medium hover:opacity-90 transition-all cursor-pointer">
            + Create Issue
          </button>
        </div>

        {/* Kanban Board */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-8 pt-2">
            {columns.map((column) => (
              <KanbanColumn key={column.id} column={column} onIssueClick={(id) => router.push(`/issues/${id}`)} />
            ))}
          </div>
        </DndContext>
      </div>

      {/* New Issue Modal */}
      {showNewIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-2xl p-6 w-full max-w-md animate-fadeIn">
            <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Create Issue</h3>
            <form onSubmit={handleCreateIssue} className="space-y-3">
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Issue title" required autoFocus
                className="w-full px-4 py-2.5 rounded-lg border bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-all" />
              <div className="flex gap-2">
                <select value={newType} onChange={(e) => setNewType(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]">
                  <option value="task">Task</option>
                  <option value="bug">Bug</option>
                  <option value="story">Story</option>
                  <option value="epic">Epic</option>
                </select>
                <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowNewIssue(false)}
                  className="flex-1 py-2 rounded-lg border border-[var(--border-color)] text-sm cursor-pointer" style={{ color: "var(--text-secondary)" }}>Cancel</button>
                <button type="submit"
                  className="flex-1 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium cursor-pointer">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
