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

import { createSeedData } from "./seed";
import type { Priority, Status, Ticket, TrackerData, Project, User, OrgRole } from "./types";
import { graphqlRequest } from "../graphql-client";
import { useAuth } from "../auth-context";

const STORAGE_KEY = "lovable.tracker.v2";

const uid = () => Math.random().toString(36).slice(2, 10);

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
  resetDemoData: () => void;
  refetchData: () => Promise<void>;
}

const TrackerContext = createContext<TrackerContextValue | null>(null);

const GET_ORGS_AND_PROJECTS = `
  query GetOrgsAndProjects {
    organizations {
      id
      name
      slug
    }
  }
`;

const GET_PROJECTS_QUERY = `
  query GetProjects($orgId: ID!) {
    projects(orgId: $orgId) {
      id
      orgId
      key
      name
      description
    }
  }
`;

const GET_ORG_MEMBERS_QUERY = `
  query GetOrgMembers($orgId: ID!) {
    orgMembers(orgId: $orgId) {
      id
      name
      email
      avatarUrl
      role
    }
  }
`;

const GET_BOARD_QUERY = `
  query GetBoard($projectId: ID!) {
    board(projectId: $projectId) {
      id
      name
      columns {
        id
        name
        position
        issues {
          id
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

export function TrackerProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const [data, setData] = useState<TrackerData>(() => createSeedData());
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setData(JSON.parse(raw) as TrackerData);
    } catch {
      /* ignore corrupt storage */
    }
    hydrated.current = true;
    setReady(true);
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage full or unavailable */
    }
  }, [data]);

  const refetchData = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const orgData = await graphqlRequest<{ organizations: { id: string; name: string }[] }>(
        GET_ORGS_AND_PROJECTS
      );

      const orgs = orgData.organizations || [];
      const firstOrg = orgs[0];
      if (!firstOrg) return;

      const projData = await graphqlRequest<{
        projects: { id: string; key: string; name: string; description?: string }[];
      }>(GET_PROJECTS_QUERY, { orgId: firstOrg.id });

      const fetchedProjects: Project[] = (projData.projects || []).map((p) => ({
        id: p.id,
        orgId: firstOrg.id,
        key: p.key,
        name: p.name,
        description: p.description || "",
        counter: 10,
      }));

      if (fetchedProjects.length === 0) return;

      // Fetch real org members to populate the assignee picker
      let fetchedUsers: User[] = [];
      try {
        const membersRes = await graphqlRequest<{
          orgMembers: { id: string; name: string; email: string; avatarUrl?: string; role: string }[];
        }>(GET_ORG_MEMBERS_QUERY, { orgId: firstOrg.id });
        fetchedUsers = (membersRes.orgMembers || []).map((m) => ({
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
          role: m.role as OrgRole,
        }));
      } catch {
        /* keep seed users if member fetch fails */
      }

      let allTickets: Ticket[] = [];
      for (const proj of fetchedProjects) {
        try {
          const boardRes = await graphqlRequest<{
            board: {
              columns: {
                id: string;
                name: string;
                issues: any[];
              }[];
            };
          }>(GET_BOARD_QUERY, { projectId: proj.id });

          if (boardRes.board && boardRes.board.columns) {
            for (const col of boardRes.board.columns) {
              for (const iss of col.issues || []) {
                allTickets.push({
                  id: iss.id,
                  projectId: proj.id,
                  key: iss.key,
                  title: iss.title,
                  description: iss.description || "",
                  status: normalizeStatus(iss.status),
                  priority: normalizePriority(iss.priority),
                  assigneeId: iss.assigneeId || null,
                  labels: (iss.labels || []).map((l: any) => l.name || l),
                  order: 0,
                  createdAt: iss.createdAt || new Date().toISOString(),
                  updatedAt: iss.updatedAt || new Date().toISOString(),
                });
              }
            }
          }
        } catch {
          /* skip unreachable project */
        }
      }

      setData((prev) => ({
        ...prev,
        projects: fetchedProjects.length > 0 ? fetchedProjects : prev.projects,
        tickets: allTickets.length > 0 ? allTickets : prev.tickets,
        users: fetchedUsers.length > 0 ? fetchedUsers : prev.users,
      }));
    } catch (e) {
      console.warn("Backend GraphQL unavailable, using cached local data", e);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refetchData();
  }, [refetchData]);

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

  const deleteTicket = useCallback<TrackerContextValue["deleteTicket"]>((id) => {
    setData((prev) => ({
      ...prev,
      tickets: prev.tickets.filter((t) => t.id !== id),
      comments: prev.comments.filter((c) => c.ticketId !== id),
    }));
  }, []);

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

  const resetDemoData = useCallback(() => setData(createSeedData()), []);

  const value = useMemo<TrackerContextValue>(
    () => ({
      ...data,
      ready,
      createTicket,
      updateTicket,
      moveTicket,
      deleteTicket,
      addComment,
      resetDemoData,
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
      resetDemoData,
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

export const CURRENT_USER_ID = "u1";
