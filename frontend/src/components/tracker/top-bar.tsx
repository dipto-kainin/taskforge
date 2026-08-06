import { useNavigate } from "@tanstack/react-router";
import { LogOut, Plus, Search, User } from "lucide-react";
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
import { Ticket } from "@/lib/tracker/types";
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
        setOpen((v: boolean) => !v);
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
        className="flex h-9 flex-1 max-w-sm items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-muted-foreground transition-colors hover:border-ring/50"
      >
        <Search className="size-4" />
        <span className="truncate">Search tickets…</span>
        <kbd className="ml-auto hidden rounded border border-border px-1.5 py-0.5 text-[0.625rem] sm:inline">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-3">
        <NewTicketDialog
          projectId={projects[0]?.id ?? ""}
          trigger={
            <Button size="sm">
              <Plus className="size-4" />
              New ticket
            </Button>
          }
        />

        {isAuthenticated && user ? (
          <div className="flex items-center gap-2 border-l border-border pl-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
              {user.name ? user.name.slice(0, 2).toUpperCase() : "U"}
            </div>
            <div className="hidden md:block text-left">
              <div className="text-xs font-medium text-foreground truncate max-w-[120px]">
                {user.name}
              </div>
              <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                {user.email}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              title="Log out"
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: "/login" })}
            className="gap-1.5"
          >
            <User className="size-3.5" />
            Log in
          </Button>
        )}
      </div>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search by key or title…" />
        <CommandList>
          <CommandEmpty>No tickets found.</CommandEmpty>
          <CommandGroup heading="Tickets">
            {tickets.map((t: Ticket) => (
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
