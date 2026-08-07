import { useNavigate, Link } from "@tanstack/react-router";
import { LogIn, LogOut, Plus, Search, User } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useTracker } from "@/lib/tracker/store";
import { useAuth } from "@/lib/auth-context";
import { NewTicketDialog } from "./new-ticket-dialog";
import { StatusChip } from "./chips";

export function TopBar() {
  const { tickets, projects } = useTracker();
  const { user, isAuthenticated, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur">
      <SidebarTrigger />
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 flex-1 max-w-sm items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-ring/50"
      >
        <Search className="size-4" />
        <span className="truncate">Search issues…</span>
        <kbd className="ml-auto hidden rounded border border-border px-1.5 py-0.5 text-[0.625rem] sm:inline">
          ⌘K
        </kbd>
      </button>
      <div className="ml-auto flex items-center gap-2">
        <NewTicketDialog
          projectId={projects[0]?.id ?? ""}
          trigger={
            <Button size="sm">
              <Plus className="size-4" />
              New issue
            </Button>
          }
        />

        {isAuthenticated && user ? (
          <div className="flex items-center gap-2 border-l border-border pl-2">
            <span className="text-xs font-medium hidden sm:inline-block text-foreground">
              {user.name}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              title="Log out"
              className="gap-1.5 text-xs"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        ) : (
          <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
            <Link to="/login">
              <LogIn className="size-3.5" />
              <span>Log in</span>
            </Link>
          </Button>
        )}
      </div>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search by key or title…" />
        <CommandList>
          <CommandEmpty>No issues found.</CommandEmpty>
          <CommandGroup heading="Issues">
            {tickets.map((t) => (
              <CommandItem
                key={t.id}
                value={`${t.key} ${t.title}`}
                onSelect={() => {
                  setOpen(false);
                  navigate({
                    to: "/projects/$projectId/tickets/$ticketId",
                    params: { projectId: t.projectId, ticketId: t.id },
                  });
                }}
              >
                <span className="font-mono text-xs text-muted-foreground">{t.key}</span>
                <span className="truncate">{t.title}</span>
                <StatusChip status={t.status} className="ml-auto" />
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </header>
  );
}
