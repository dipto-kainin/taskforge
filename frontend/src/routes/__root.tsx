import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Blocks } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { AppSidebar } from "@/components/tracker/app-sidebar";
import { TopBar } from "@/components/tracker/top-bar";
import { TrackerProvider } from "@/lib/tracker/store";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { BlockWorkLogo } from "@/components/tracker/logo";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Block Work — Issue Tracker" },
      {
        name: "description",
        content: "A bold, airy issue tracker with kanban boards, backlogs and personal work stats.",
      },
      { property: "og:title", content: "Block Work — Issue Tracker" },
      {
        property: "og:description",
        content: "A bold, airy issue tracker with kanban boards, backlogs and personal work stats.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Space+Grotesk:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** Full sidebar + content layout shown to authenticated users */
function AuthenticatedApp() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <TopBar />
        <main className="nb-grid min-w-0 flex-1 p-6 md:p-10">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

/** Neo-brutalist login wall shown to unauthenticated visitors */
function LandingWall() {
  return (
    <div className="nb-grid flex min-h-screen flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between border-b-2 border-foreground bg-card px-6 py-4">
        <BlockWorkLogo size="md" />
        <Button asChild variant="outline" className="nb-sm font-semibold">
          <Link to="/login">Sign in</Link>
        </Button>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <p className="label-caps mb-4">Project management, reimagined</p>
        <h1 className="font-display text-5xl uppercase leading-tight md:text-7xl lg:text-8xl">
          Ship work.
          <br />
          <span className="bg-primary px-2">Track it.</span>
        </h1>
        <p className="mt-8 max-w-xl text-lg text-muted-foreground">
          Kanban boards, backlogs, assignees and real-time updates — all in one brutally simple workspace.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Button asChild size="lg" className="nb nb-hover gap-2 font-display text-base uppercase">
            <Link to="/login">
              Get started <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        {/* Feature chips */}
        <div className="mt-16 flex flex-wrap justify-center gap-3">
          {["Kanban Boards", "Backlogs", "Assignees", "3-Level Roles", "Real-time Updates"].map((f) => (
            <span key={f} className="nb-sm bg-secondary px-4 py-2 font-semibold text-sm">
              {f}
            </span>
          ))}
        </div>
      </main>
    </div>
  );
}

/** Decides which shell to render based on auth state */
function InnerApp() {
  const auth = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || auth?.isLoading) {
    return (
      <div className="nb-grid flex min-h-screen items-center justify-center bg-background">
        <div className="nb flex items-center gap-3 bg-card px-6 py-4">
          <div className="size-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
          <span className="font-display text-sm uppercase">Loading Block Work…</span>
        </div>
      </div>
    );
  }

  if (!auth?.isAuthenticated) {
    if (pathname === "/login") {
      return <Outlet />;
    }
    return <LandingWall />;
  }

  return <AuthenticatedApp />;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TrackerProvider>
          <InnerApp />
          <Toaster />
        </TrackerProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
