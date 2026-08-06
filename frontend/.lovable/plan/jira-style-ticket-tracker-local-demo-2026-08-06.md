# Jira-style Ticket Tracker (local demo)

A clean, light, minimal issue tracker with multiple projects, a drag-and-drop kanban board, a filterable backlog, and ticket detail with comments. All data lives in the browser (localStorage) — no login, no server. Seeded with realistic demo projects and tickets so it looks alive on first load.

## Screens

- **Dashboard (`/`)** — project cards with progress bars, counts by status, priority breakdown, recent activity.
- **Board (`/projects/$projectId/board`)** — Backlog / To Do / In Progress / Done columns, drag cards between columns, inline "new ticket" per column, WIP counts.
- **Backlog (`/projects/$projectId/backlog`)** — dense table: key, title, status, priority, assignee, labels. Search box plus filters for assignee, priority, status; sortable columns. Filters live in the URL.
- **Ticket detail (`/projects/$projectId/tickets/$ticketId`)** — title/description (editable inline), status, priority, assignee, labels, created date, and a comment thread you can post to.

## Navigation & shell

Left sidebar with project switcher and per-project nav (Board, Backlog), collapsible to icons. Top bar with search and "New ticket" action.

## Look

Clean light minimal: generous whitespace, soft neutral surfaces, one restrained accent color, subtle borders instead of heavy shadows, small caps labels, a distinctive geometric-sans heading + humanist body pairing. Priority and status shown as quiet colored chips, not loud badges. Smooth card lift and column highlight while dragging. Full design token set in `src/styles.css` (light + dark values), no hardcoded colors in components.

## Technical notes

- TanStack Router file routes; ticket/board/backlog routes under `/projects/$projectId/...`.
- Store: a small React context + reducer over `localStorage` (`src/lib/store/`), with typed models (Project, Ticket, Comment, User) and seed data in `src/lib/seed.ts`. Auto-generated ticket keys like `WEB-14`.
- Backlog filters/search/sort as URL search params via `validateSearch` + `zodValidator` with `fallback()`.
- Drag and drop with `@dnd-kit/core` + `@dnd-kit/sortable` (also supports keyboard drag for accessibility).
- shadcn components for table, dialog, select, popover, avatar, tabs, sidebar; sonner for toasts.
- Per-route `head()` metadata with unique titles/descriptions.

## Not in this version

No accounts, no shared/persisted server data, no sprints or time tracking. Easy to move onto Lovable Cloud later if you want real multi-user data.
