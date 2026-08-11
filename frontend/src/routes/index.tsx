import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, CircleDot, Eye, Flame } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { StatusChip } from "@/components/tracker/chips";
import { Assignee } from "@/components/tracker/assignee";
import { useTracker } from "@/lib/tracker/store";
import { STATUSES } from "@/lib/tracker/types";
import { cn } from "@/lib/utils";

import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home — Your Work Stats | Blockwork" },
      {
        name: "description",
        content:
          "Your personal tracker home: issues resolved, work in progress, review queue and activity across every project.",
      },
      { property: "og:title", content: "Home — Your Work Stats | Blockwork" },
      {
        property: "og:description",
        content: "Issues resolved, in progress and in review across every project you touch.",
      },
    ],
  }),
  component: HomePage,
});

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <div className={cn("nb p-6", tone)}>
      <div className="flex items-start justify-between">
        <p className="label-caps text-foreground/70">{label}</p>
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="mt-6 font-display text-5xl leading-none">{value}</p>
    </div>
  );
}

function HomePageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-12 animate-pulse">
      {/* Header Skeleton — Deep High Contrast */}
      <header className="space-y-4">
        <div className="h-4 w-32 rounded bg-foreground/25" />
        <div className="h-12 w-80 rounded bg-foreground/35" />
        <div className="h-4 w-full max-w-xl rounded bg-foreground/20" />
      </header>

      {/* KPI Cards Skeleton */}
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="nb p-6 bg-card border-2 border-foreground/30 space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-24 rounded bg-foreground/25" />
              <div className="size-6 rounded bg-foreground/30" />
            </div>
            <div className="h-12 w-20 rounded bg-foreground/35 mt-4" />
          </div>
        ))}
      </section>

      {/* Completion Bar Skeleton */}
      <section className="nb space-y-6 p-8 bg-card border-2 border-foreground/30">
        <div className="flex justify-between items-center">
          <div className="h-6 w-44 rounded bg-foreground/30" />
          <div className="h-8 w-20 rounded bg-foreground/35" />
        </div>
        <div className="h-7 w-full rounded border-2 border-foreground/40 bg-foreground/15" />
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5 pt-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="border-2 border-foreground/30 p-4 space-y-2 bg-background/50">
              <div className="h-3.5 w-20 rounded bg-foreground/25" />
              <div className="h-7 w-12 rounded bg-foreground/35" />
            </div>
          ))}
        </div>
      </section>

      {/* Recent Activity Skeleton */}
      <section className="space-y-5">
        <div className="flex justify-between items-center">
          <div className="h-6 w-44 rounded bg-foreground/30" />
          <div className="h-4 w-52 rounded bg-foreground/20" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="nb-sm p-5 bg-card border-2 border-foreground/30 space-y-4">
              <div className="flex justify-between items-center">
                <div className="h-4 w-20 rounded bg-foreground/25 font-mono" />
                <div className="h-6 w-24 rounded-full bg-foreground/30" />
              </div>
              <div className="h-6 w-4/5 rounded bg-foreground/35" />
              <div className="h-4 w-28 rounded bg-foreground/20" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function HomePage() {
  const { ready, tickets, comments, projects, users } = useTracker();
  const auth = useAuth();

  if (!ready) {
    return <HomePageSkeleton />;
  }

  const myId = auth?.user?.id ?? "";
  const myName = auth?.user?.name || users.find((u) => u.id === myId)?.name || "Your";

  const mine = tickets.filter((t) => t.assigneeId === myId);

  const resolved = mine.filter((t) => t.status === "done").length;
  const inProgress = mine.filter((t) => t.status === "in_progress").length;
  const inReview = mine.filter((t) => t.status === "in_review").length;
  const urgent = mine.filter((t) => t.priority === "urgent" && t.status !== "done").length;

  const total = mine.length || 1;
  const completion = Math.round((resolved / total) * 100);

  const byStatus = STATUSES.map((s) => ({
    ...s,
    count: mine.filter((t) => t.status === s.id).length,
  }));

  const recent = [...tickets]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-12">
      <header className="space-y-3">
        <p className="label-caps">Welcome back</p>
        <h1 className="font-display text-4xl uppercase leading-tight md:text-5xl">
          {myName} dashboard
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          {mine.length} issues assigned to you across {projects.length} projects. You have resolved{" "}
          {resolved} of them.
        </p>
      </header>

      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Resolved" value={resolved} icon={CheckCircle2} tone="bg-done" />
        <Kpi label="In progress" value={inProgress} icon={CircleDot} tone="bg-progress" />
        <Kpi label="In review" value={inReview} icon={Eye} tone="bg-accent" />
        <Kpi label="Urgent open" value={urgent} icon={Flame} tone="bg-urgent" />
      </section>

      <section className="nb space-y-6 p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-xl uppercase">Completion rate</h2>
          <p className="font-display text-3xl">{completion}%</p>
        </div>
        <div className="h-6 w-full border-2 border-foreground bg-secondary">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${completion}%` }} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {byStatus.map((s) => (
            <div key={s.id} className="border-2 border-foreground p-4">
              <p className="label-caps">{s.label}</p>
              <p className="mt-2 font-display text-2xl">{s.count}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl uppercase">Recent activity</h2>
          <Link to="/assigned" className="text-sm font-semibold underline underline-offset-4">
            See everything assigned to me
          </Link>
        </div>
        <ul className="grid gap-4 md:grid-cols-2">
          {recent.map((t) => (
            <li key={t.id} className="nb-sm nb-hover p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[0.6875rem] font-bold text-muted-foreground">
                  {t.key}
                </span>
                <StatusChip status={t.status} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <Link
                  to="/projects/$projectId/tickets/$ticketId"
                  params={{ projectId: t.projectId, ticketId: t.id }}
                  className="text-sm font-semibold hover:underline"
                >
                  {t.title}
                </Link>
                <Assignee id={t.assigneeId} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {comments.filter((c) => c.ticketId === t.id).length} comments
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
