import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { Priority, Status, Ticket, TrackerData, Project, User, ProjectRole } from "./types";
import { graphqlRequest } from "../graphql-client";
import { useAuth } from "../auth-context";

const uid = () => Math.random().toString(36).slice(2, 10);

const EMPTY_DATA: TrackerData = { projects: [], tickets: [], comments: [], users: [] };

interface TrackerContextValue extends TrackerData {
  ready: boolean;
  createTicket: (input: {
    projectId: string;
    title: string;
    description?: string;
    status?: Status;
    priority?: Priority;
    assigneeId?: string | null;
    labels?: string[];
  }) => Ticket;
  updateTicket: (id: string, patch: Partial<Omit<Ticket, "id" | "projectId" | "key">>) => void;
  moveTicket: (id: string, status: Status, index: number) => void;
  deleteTicket: (id: string) => void;
  addComment: (ticketId: string, body: string, authorId: string) => void;
  refetchData: () => Promise<void>;
}

const TrackerContext = createContext<TrackerContextValue | null>(null);

// ── Single dashboard query ─────────────────────────────────────────────────────
// Replaces the previous 1 + N + N waterfall (myProjects + members/project + board/project).
// The gateway aggregates all data server-side; the frontend gets projects, tickets,
// and members in one round-trip.
const GET_DASHBOARD_QUERY = `
  query GetDashboard {
    dashboard {
      projects {
        id
        key
        name
        description
        myRole
      }
      tickets {
        id
        projectId
        key
        title
        description
        type
        status
        priority
        assigneeId
        columnId
        storyPoints
        createdAt
        updatedAt
        labels {
          id
          name
          color
        }
      }
      membersByProject {
        projectId
        members {
          id
          name
          email
          avatarUrl
          role
        }
      }
    }
  }
`;

const CREATE_ISSUE_MUTATION = `
  mutation CreateIssue($input: CreateIssueInput!) {
    createIssue(input: $input) {
      id
      projectId
      key
      title
      description
      status
      priority
      columnId
      assigneeId
      createdAt
      updatedAt
    }
  }
`;

const UPDATE_ISSUE_MUTATION = `
  mutation UpdateIssue($id: ID!, $input: UpdateIssueInput!) {
    updateIssue(id: $id, input: $input) {
      id
      key
      title
      status
      columnId
      priority
      assigneeId
    }
  }
`;

const DELETE_ISSUE_MUTATION = `
  mutation DeleteIssue($id: ID!) {
    deleteIssue(id: $id)
  }
`;

const CREATE_COMMENT_MUTATION = `
  mutation CreateComment($issueId: ID!, $body: String!) {
    createComment(issueId: $issueId, body: $body) {
      id
      authorId
      body
      createdAt
    }
  }
`;

function normalizeStatus(statusStr: string): Status {
  const s = (statusStr || "").toLowerCase();
  if (s === "in_progress" || s === "in progress" || s === "inprogress") return "in_progress";
  if (s === "in_review" || s === "in review" || s === "inreview") return "in_review";
  if (s === "done" || s === "completed") return "done";
  if (s === "todo" || s === "to_do" || s === "to do") return "todo";
  return "backlog";
}

function normalizePriority(pStr: string): Priority {
  const p = (pStr || "").toLowerCase();
  if (p === "urgent" || p === "critical") return "urgent";
  if (p === "high") return "high";
  if (p === "medium") return "medium";
  if (p === "low") return "low";
  return "lowest";
}

/**
 * Shallow equality check on TrackerData to avoid unnecessary re-renders.
 * Compares project/ticket/user counts and first-item IDs as a quick heuristic.
 */
function shallowDataEqual(a: TrackerData, b: TrackerData): boolean {
  if (a.projects.length !== b.projects.length) return false;
  if (a.tickets.length !== b.tickets.length) return false;
  if (a.users.length !== b.users.length) return false;
  // Quick spot-check: compare first project ID and first ticket ID
  if (a.projects[0]?.id !== b.projects[0]?.id) return false;
  if (a.tickets[0]?.id !== b.tickets[0]?.id) return false;
  return true;
}

export function TrackerProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const [data, setData] = useState<TrackerData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);

  // Track whether this is the very first fetch. On first fetch we keep ready=false
  // (shows skeleton). On subsequent re-fetches we keep ready=true so existing
  // data stays visible while fresh data loads in background.
  const hasLoadedOnce = useRef(false);

  const refetchData = useCallback(async () => {
    if (!isAuthenticated) return;

    // Only reset ready on the very first load — never blank the UI on re-fetches.
    if (!hasLoadedOnce.current) {
      setReady(false);
    }

    try {
      const result = await graphqlRequest<{
        dashboard: {
          projects: { id: string; key: string; name: string; description?: string; myRole?: string }[];
          tickets: {
            id: string;
            projectId: string;
            key: string;
            title: string;
            description?: string;
            type?: string;
            status: string;
            priority: string;
            assigneeId?: string | null;
            columnId?: string | null;
            storyPoints?: number | null;
            createdAt?: string;
            updatedAt?: string;
            labels?: { id: string; name: string; color: string }[];
          }[];
          membersByProject: {
            projectId: string;
            members: { id: string; name: string; email: string; avatarUrl?: string; role: string }[];
          }[];
        };
      }>(GET_DASHBOARD_QUERY);

      const dashboard = result.dashboard;

      // ── Map projects ──────────────────────────────────────────────────────
      const fetchedProjects: Project[] = (dashboard.projects || []).map((p) => ({
        id: p.id,
        key: p.key,
        name: p.name,
        description: p.description || "",
        counter: 10,
        myRole: (p.myRole as ProjectRole) || "member",
      }));

      // ── Map tickets ───────────────────────────────────────────────────────
      const fetchedTickets: Ticket[] = (dashboard.tickets || []).map((t) => ({
        id: t.id,
        projectId: t.projectId,
        key: t.key,
        title: t.title,
        description: t.description || "",
        status: normalizeStatus(t.status),
        priority: normalizePriority(t.priority),
        assigneeId: t.assigneeId || null,
        labels: (t.labels || []).map((l) => l.name),
        order: 0,
        createdAt: t.createdAt || new Date().toISOString(),
        updatedAt: t.updatedAt || new Date().toISOString(),
      }));

      // ── Deduplicate users across all projects ─────────────────────────────
      const userMap = new Map<string, User>();
      for (const entry of dashboard.membersByProject || []) {
        for (const m of entry.members || []) {
          if (!userMap.has(m.id)) {
            userMap.set(m.id, {
              id: m.id,
              name: m.name,
              email: m.email,
              avatarUrl: m.avatarUrl ?? null,
              initials: m.name
                .split(" ")
                .map((w) => w[0])
                .join("")
                .toUpperCase()
                .slice(0, 2),
              role: m.role as ProjectRole,
            });
          }
        }
      }
      const fetchedUsers = Array.from(userMap.values());

      const newData: TrackerData = {
        projects: fetchedProjects,
        tickets: fetchedTickets,
        users: fetchedUsers,
        comments: [],
      };

      // Only call setData if data actually changed to avoid unnecessary re-renders.
      setData((prev) => (shallowDataEqual(prev, newData) ? prev : newData));
    } catch (e: any) {
      console.error("Failed to fetch dashboard data from backend", e);
      if (e?.message?.includes("401") || e?.message?.includes("Unauthorized") || e?.message?.includes("403")) {
        auth?.logout();
      }
    } finally {
      hasLoadedOnce.current = true;
      setReady(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      refetchData();
    } else {
      // Reset on logout
      hasLoadedOnce.current = false;
      setData(EMPTY_DATA);
      setReady(true);
    }
  }, [isAuthenticated, refetchData]);

  const createTicket = useCallback<TrackerContextValue["createTicket"]>(
    (input) => {
      let created: Ticket | null = null;
      setData((prev) => {
        const project = prev.projects.find((p) => p.id === input.projectId) || prev.projects[0];
        if (!project) return prev;
        const counter = project.counter + 1;
        const status = input.status ?? "backlog";
        const now = new Date().toISOString();
        const ticket: Ticket = {
          id: uid(),
          projectId: project.id,
          key: `${project.key}-${counter}`,
          title: input.title.trim(),
          description: input.description?.trim() ?? "",
          status,
          priority: input.priority ?? "medium",
          assigneeId: input.assigneeId ?? null,
          labels: input.labels ?? [],
          order: -1,
          createdAt: now,
          updatedAt: now,
        };
        created = ticket;
        return {
          ...prev,
          projects: prev.projects.map((p) => (p.id === project.id ? { ...p, counter } : p)),
          tickets: [ticket, ...prev.tickets],
        };
      });

      if (isAuthenticated && input.projectId) {
        graphqlRequest(CREATE_ISSUE_MUTATION, {
          input: {
            projectId: input.projectId,
            title: input.title,
            description: input.description || "",
            priority: (input.priority || "medium").toUpperCase(),
            assigneeId: input.assigneeId || null,
          },
        }).catch((err) => console.error("Error persisting issue to backend:", err));
      }

      return created as unknown as Ticket;
    },
    [isAuthenticated]
  );

  const updateTicket = useCallback<TrackerContextValue["updateTicket"]>(
    (id, patch) => {
      setData((prev) => ({
        ...prev,
        tickets: prev.tickets.map((t) =>
          t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
        ),
      }));

      if (isAuthenticated) {
        interface UpdatePayload {
          title?: string;
          description?: string;
          status?: string;
          priority?: string;
          assigneeId?: string | null;
        }
        const inputPayload: UpdatePayload = {};
        if (patch.title) inputPayload.title = patch.title;
        if (patch.description) inputPayload.description = patch.description;
        if (patch.status) inputPayload.status = patch.status.toUpperCase();
        if (patch.priority) inputPayload.priority = patch.priority.toUpperCase();
        if (patch.assigneeId !== undefined) inputPayload.assigneeId = patch.assigneeId;

        if (Object.keys(inputPayload).length > 0) {
          graphqlRequest(UPDATE_ISSUE_MUTATION, {
            id,
            input: inputPayload,
          }).catch((err) => console.error("Error updating issue in backend:", err));
        }
      }
    },
    [isAuthenticated]
  );

  const moveTicket = useCallback<TrackerContextValue["moveTicket"]>(
    (id, status, index) => {
      setData((prev) => {
        const ticket = prev.tickets.find((t) => t.id === id);
        if (!ticket) return prev;
        const column = prev.tickets
          .filter((t) => t.projectId === ticket.projectId && t.status === status && t.id !== id)
          .sort((a, b) => a.order - b.order);
        const next = { ...ticket, status, updatedAt: new Date().toISOString() };
        column.splice(Math.max(0, Math.min(index, column.length)), 0, next);
        const orders = new Map(column.map((t, i) => [t.id, i]));
        return {
          ...prev,
          tickets: prev.tickets.map((t) => {
            if (t.id === id) return { ...next, order: orders.get(id) ?? 0 };
            const order = orders.get(t.id);
            return order === undefined ? t : { ...t, order };
          }),
        };
      });

      if (isAuthenticated) {
        graphqlRequest(UPDATE_ISSUE_MUTATION, {
          id,
          input: { status: status.toUpperCase() },
        }).catch((err) => console.error("Error moving ticket status in backend:", err));
      }
    },
    [isAuthenticated]
  );

  const deleteTicket = useCallback<TrackerContextValue["deleteTicket"]>(
    (id) => {
      setData((prev) => ({
        ...prev,
        tickets: prev.tickets.filter((t) => t.id !== id),
        comments: prev.comments.filter((c) => c.ticketId !== id),
      }));

      if (isAuthenticated) {
        graphqlRequest(DELETE_ISSUE_MUTATION, { id }).catch((err) =>
          console.error("Error deleting issue in backend:", err)
        );
      }
    },
    [isAuthenticated]
  );

  const addComment = useCallback<TrackerContextValue["addComment"]>(
    (ticketId, body, authorId) => {
      setData((prev) => ({
        ...prev,
        comments: [
          ...prev.comments,
          { id: uid(), ticketId, authorId, body: body.trim(), createdAt: new Date().toISOString() },
        ],
      }));

      if (isAuthenticated) {
        graphqlRequest(CREATE_COMMENT_MUTATION, {
          issueId: ticketId,
          body: body.trim(),
        }).catch((err) => console.error("Error creating comment in backend:", err));
      }
    },
    [isAuthenticated]
  );

  const value = useMemo<TrackerContextValue>(
    () => ({
      ...data,
      ready,
      createTicket,
      updateTicket,
      moveTicket,
      deleteTicket,
      addComment,
      refetchData,
    }),
    [
      data,
      ready,
      createTicket,
      updateTicket,
      moveTicket,
      deleteTicket,
      addComment,
      refetchData,
    ]
  );

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}

export function useTracker() {
  const ctx = useContext(TrackerContext);
  if (!ctx) throw new Error("useTracker must be used inside TrackerProvider");
  return ctx;
}

export function useProject(projectId: string) {
  const { projects } = useTracker();
  return projects.find((p) => p.id === projectId) ?? null;
}
