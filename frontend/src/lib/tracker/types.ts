export type Status = "backlog" | "todo" | "in_progress" | "in_review" | "done";
export type Priority = "lowest" | "low" | "medium" | "high" | "urgent";
export type ProjectRole = "owner" | "admin" | "member";

export interface User {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string | null | undefined;
  initials: string;
  role?: ProjectRole;
}

export interface Comment {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface Ticket {
  id: string;
  projectId: string;
  key: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  assigneeId: string | null;
  labels: string[];
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  description: string;
  counter: number;
  myRole?: ProjectRole;
}

export interface TrackerData {
  projects: Project[];
  tickets: Ticket[];
  comments: Comment[];
  users: User[];
}

export const STATUSES: { id: Status; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "in_review", label: "In Review" },
  { id: "done", label: "Done" },
];

/** Columns rendered on the kanban board. Done lives behind the "completed" toggle. */
export const BOARD_STATUSES = STATUSES.filter((s) => s.id !== "done");

export const PRIORITIES: { id: Priority; label: string }[] = [
  { id: "urgent", label: "Urgent" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
  { id: "lowest", label: "Lowest" },
];

export const statusLabel = (s: Status) => STATUSES.find((x) => x.id === s)?.label ?? s;
export const priorityLabel = (p: Priority) => PRIORITIES.find((x) => x.id === p)?.label ?? p;
