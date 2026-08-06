import type { Comment, Priority, Project, Status, Ticket, TrackerData, User } from "./types";

const users: User[] = [
  { id: "u1", name: "Maya Rivera", initials: "MR" },
  { id: "u2", name: "Devan Shah", initials: "DS" },
  { id: "u3", name: "Iris Kowalski", initials: "IK" },
  { id: "u4", name: "Tom Berger", initials: "TB" },
  { id: "u5", name: "Nadia Osei", initials: "NO" },
];

const projects: Project[] = [
  {
    id: "p1",
    key: "WEB",
    name: "Website Revamp",
    description: "Marketing site rebuild, new design system and CMS migration.",
    counter: 0,
  },
  {
    id: "p2",
    key: "APP",
    name: "Mobile App",
    description: "iOS and Android client for the customer portal.",
    counter: 0,
  },
  {
    id: "p3",
    key: "OPS",
    name: "Platform Ops",
    description: "Infrastructure, observability and release tooling.",
    counter: 0,
  },
];

type Row = [string, string, Status, Priority, string | null, string[]];

const rows: Record<string, Row[]> = {
  p1: [
    ["Rewrite pricing page copy", "Tighten the value props and add a comparison table.", "in_progress", "high", "u1", ["content"]],
    ["Design system: color tokens", "Define semantic tokens for light and dark surfaces.", "done", "medium", "u3", ["design", "foundation"]],
    ["Migrate blog to new CMS", "Move 140 posts, preserve slugs and redirects.", "todo", "high", "u2", ["cms"]],
    ["Fix layout shift on hero", "LCP image needs explicit dimensions.", "in_progress", "urgent", "u4", ["perf", "bug"]],
    ["Add customer logo wall", "Six logos, grayscale with hover color.", "backlog", "low", null, ["design"]],
    ["Cookie banner compliance", "Consent categories and storage of preferences.", "todo", "medium", "u5", ["legal"]],
    ["Sitemap + robots audit", "Ensure new routes are indexed correctly.", "backlog", "lowest", "u2", ["seo"]],
    ["Careers page template", "Reusable job posting layout with structured data.", "done", "low", "u1", ["seo"]],
    ["Contact form spam filter", "Honeypot plus rate limiting.", "backlog", "medium", "u4", ["bug"]],
  ],
  p2: [
    ["Offline mode for order list", "Cache last 50 orders and sync on reconnect.", "in_progress", "urgent", "u2", ["mobile", "sync"]],
    ["Push notification opt-in", "Ask after the second successful order.", "todo", "medium", "u5", ["growth"]],
    ["Crash on Android 13 launch", "Null reference in the session bootstrap.", "in_progress", "urgent", "u4", ["bug"]],
    ["Biometric unlock", "Face ID and fingerprint for returning users.", "backlog", "high", "u3", ["security"]],
    ["Dark theme pass", "Audit every screen against the new tokens.", "todo", "low", "u1", ["design"]],
    ["Reduce cold start time", "Defer analytics SDK initialisation.", "done", "high", "u2", ["perf"]],
    ["In-app changelog", "Show release notes after an update.", "backlog", "lowest", null, []],
  ],
  p3: [
    ["Blue/green deploys", "Cut over traffic without downtime.", "in_progress", "high", "u4", ["infra"]],
    ["Alert fatigue cleanup", "Delete 30 noisy alerts, tune thresholds.", "todo", "medium", "u5", ["observability"]],
    ["Nightly backup verification", "Restore into a scratch environment weekly.", "backlog", "high", "u2", ["infra", "risk"]],
    ["Terraform state locking", "Move state to remote backend with locks.", "done", "urgent", "u4", ["infra"]],
    ["Cost dashboard", "Break down spend by service and environment.", "backlog", "low", "u3", ["finops"]],
    ["Rotate service credentials", "Quarterly rotation with automation.", "todo", "medium", "u1", ["security"]],
  ],
};

const bodies = [
  "Pulled this into the current cycle — happy to pair on it tomorrow.",
  "I reproduced it on staging. Attaching steps in the description.",
  "Blocked until the design tokens land, otherwise we redo the work twice.",
  "Scope looks right. Let's keep the follow-up work in a separate ticket.",
  "Shipped behind a flag, will roll out to 10% first.",
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
