import type { Comment, Priority, Project, Status, Ticket, TrackerData, User } from "./types";

const users: User[] = [
  { id: "u1", name: "Maya Reyes", initials: "MR" },
  { id: "u2", name: "Dan Ashford", initials: "DA" },
  { id: "u3", name: "Isabel Nunes", initials: "IN" },
  { id: "u4", name: "Tor Grimsby", initials: "TG" },
  { id: "u5", name: "Nadia Ember", initials: "NE" },
];

const projects: Project[] = [
  {
    id: "p1",
    orgId: "org-demo",
    key: "WEB",
    name: "Marketing Website",
    description: "Public site, landing pages and the content pipeline.",
    counter: 0,
  },
  {
    id: "p2",
    orgId: "org-demo",
    key: "APP",
    name: "Mobile App",
    description: "iOS and Android client, offline sync and release trains.",
    counter: 0,
  },
  {
    id: "p3",
    orgId: "org-demo",
    key: "PLT",
    name: "Platform",
    description: "APIs, infrastructure, billing and internal tooling.",
    counter: 0,
  },
];

type Row = [string, string, Status, Priority, string | null, string[]];

const rows: Record<string, Row[]> = {
  p1: [
    ["Rebuild the pricing page", "New tiers, annual toggle and a comparison table.", "in_progress", "high", "u1", ["frontend"]],
    ["Fix layout shift on hero image", "CLS is 0.28 on mobile. Reserve space for the hero.", "in_review", "medium", "u3", ["perf", "bug"]],
    ["Migrate blog to MDX", "Move 42 posts and keep existing URLs intact.", "todo", "high", "u2", ["content"]],
    ["Add cookie consent banner", "Region-aware, blocks analytics until accepted.", "in_progress", "urgent", "u4", ["legal"]],
    ["Audit page metadata", "Titles, descriptions and OG images across all routes.", "backlog", "low", null, ["seo"]],
    ["Dark mode for docs", "Respect system preference with a manual override.", "todo", "medium", "u5", ["frontend"]],
    ["Compress marketing imagery", "Ship AVIF with JPEG fallbacks.", "backlog", "lowest", "u2", ["perf"]],
    ["Ship the changelog page", "Pulls entries from the release notes feed.", "done", "low", "u1", ["frontend"]],
    ["Broken links in the footer", "Three legacy links 404 after the docs move.", "in_review", "medium", "u4", ["bug"]],
  ],
  p2: [
    ["Offline sync conflicts", "Last-write-wins loses edits. Needs a merge strategy.", "in_progress", "urgent", "u2", ["sync", "bug"]],
    ["Push notification opt-in flow", "Ask after first meaningful action, not on launch.", "todo", "medium", "u5", ["ux"]],
    ["Crash on Android 13 cold start", "Null intent extras when launched from a widget.", "in_progress", "urgent", "u4", ["bug", "android"]],
    ["Biometric unlock", "Face ID and fingerprint behind a settings toggle.", "backlog", "high", "u3", ["security"]],
    ["Reduce app bundle size", "Currently 74MB. Target under 45MB.", "in_review", "low", "u1", ["perf"]],
    ["Rewrite onboarding screens", "Three steps instead of six, skippable.", "done", "high", "u2", ["ux"]],
    ["Automate release notes", "Generate from merged PR labels.", "backlog", "lowest", null, ["tooling"]],
  ],
  p3: [
    ["Rate limit the public API", "Token bucket per key, 429 with retry headers.", "in_progress", "high", "u4", ["api"]],
    ["Rotate database credentials", "Move secrets into the vault and rotate quarterly.", "todo", "medium", "u5", ["security"]],
    ["Invoice PDF generation", "Queue-based, retried, stored in object storage.", "backlog", "high", "u2", ["billing"]],
    ["Restore point-in-time backups", "Verified restore drill for the primary cluster.", "done", "urgent", "u4", ["infra"]],
    ["Onboarding runbook for new hires", "Access, environments and the deploy process.", "backlog", "low", "u3", ["docs"]],
    ["Add tracing to the worker pool", "Spans for every job with queue latency.", "in_review", "medium", "u1", ["observability"]],
  ],
};

const bodies = [
  "Picked this up — I'll open a draft PR before the end of the day.",
  "Reproduced on staging. Adding a regression test alongside the fix.",
  "Blocked until the design tokens land, otherwise we redo this twice.",
  "Scope looks right. Anything beyond this goes into a follow-up ticket.",
  "Half done and deployed behind a flag. Keeping it off in production for now.",
];

export function createSeedData(): TrackerData {
  const tickets: Ticket[] = [];
  const comments: Comment[] = [];
  const now = Date.now();
  let n = 0;

  for (const project of projects) {
    const list = rows[project.id] ?? [];
    list.forEach(([title, description, status, priority, assigneeId, labels], i) => {
      project.counter += 1;
      const id = `${project.id}-t${i + 1}`;
      const created = new Date(now - (list.length - i) * 36e5 * 19).toISOString();
      tickets.push({
        id,
        projectId: project.id,
        key: `${project.key}-${project.counter}`,
        title,
        description,
        status,
        priority,
        assigneeId,
        labels,
        order: i,
        createdAt: created,
        updatedAt: created,
      });
      if (i % 3 === 0) {
        comments.push({
          id: `${id}-c1`,
          ticketId: id,
          authorId: users[(n + 1) % users.length]!.id,
          body: bodies[n % bodies.length]!,
          createdAt: new Date(now - (list.length - i) * 36e5 * 8).toISOString(),
        });
        n += 1;
      }
    });
  }

  return { projects, tickets, comments, users };
}
