import { useNavigate, Link, useParams } from "@tanstack/react-router";
import { LogIn, LogOut, Plus, Search, Sparkles, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandInput,
} from "@/components/ui/command";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useTracker } from "@/lib/tracker/store";
import { useAuth } from "@/lib/auth-context";
import { graphqlRequest } from "@/lib/graphql-client";
import { NewTicketDialog } from "./new-ticket-dialog";
import { StatusChip } from "./chips";

const SEARCH_QUERY = `
  query Search($query: String!, $projectId: String, $useAI: Boolean) {
    search(query: $query, projectId: $projectId, useAI: $useAI) {
      issueId
      projectId
      title
      description
      similarity
    }
  }
`;

const PROJECT_HAS_AI_KEY_QUERY = `
  query ProjectHasAiKey($projectId: ID!) {
    projectHasAiKey(projectId: $projectId)
  }
`;

export function TopBar() {
  const { tickets, projects } = useTracker();
  const { user, isAuthenticated, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [useAI, setUseAI] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [aiResults, setAiResults] = useState<any[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  const params = useParams({ strict: false }) as any;
  const currentProjectId: string | undefined = params?.projectId;

  useEffect(() => {
    if (!currentProjectId) { setAiAvailable(false); return; }
    graphqlRequest<{ projectHasAiKey: boolean }>(PROJECT_HAS_AI_KEY_QUERY, {
      projectId: currentProjectId,
    })
      .then((r) => setAiAvailable(r.projectHasAiKey))
      .catch(() => setAiAvailable(false));
  }, [currentProjectId]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setAiResults([]);
    }
  }, [open]);

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

  useEffect(() => {
    if (!useAI || !open || query.trim().length < 2) {
      setAiResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setAiLoading(true);
      try {
        const res = await graphqlRequest<{ search: any[] }>(SEARCH_QUERY, {
          query: query.trim(),
          projectId: currentProjectId ?? null,
          useAI: true,
        });
        setAiResults(res.search ?? []);
      } catch {
        setAiResults([]);
      } finally {
        setAiLoading(false);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, useAI, open, currentProjectId]);

  const localResults = query.trim().length > 0
    ? tickets.filter((t) =>
        t.title.toLowerCase().includes(query.toLowerCase()) ||
        t.key.toLowerCase().includes(query.toLowerCase())
      )
    : tickets;

  const displayResults = useAI ? aiResults : localResults;

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur">
      <SidebarTrigger />
      <button
        id="global-search-trigger"
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
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <CommandInput
            placeholder="Search issues…"
            value={query}
            onValueChange={setQuery}
            className="flex-1 border-none focus:ring-0 p-0 h-auto"
          />
          <button
            id="ai-search-toggle"
            type="button"
            onClick={() => setUseAI((v) => !v)}
            title={
              aiAvailable
                ? useAI ? "AI search ON — click to use basic search" : "Click to enable AI search ✨"
                : "AI search unavailable — add an API key in Project Settings"
            }
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider transition-all shrink-0 ${
              useAI && aiAvailable
                ? "border-violet-500/60 bg-violet-500/15 text-violet-400"
                : aiAvailable
                ? "border-border text-muted-foreground hover:border-violet-500/40 hover:text-violet-400"
                : "border-border/40 text-muted-foreground/40 cursor-not-allowed"
            }`}
            disabled={!aiAvailable}
          >
            <Sparkles className="size-3" />
            AI
          </button>
        </div>

        <CommandList>
          {aiLoading && (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
              <div className="size-3 animate-spin rounded-full border border-violet-400 border-t-transparent" />
              AI searching…
            </div>
          )}

          {!aiLoading && displayResults.length === 0 && (
            <CommandEmpty>
              {useAI ? "No AI results. Try a different query." : "No issues found."}
            </CommandEmpty>
          )}

          {!aiLoading && displayResults.length > 0 && (
            <CommandGroup heading={useAI ? "AI Search Results" : "Issues"}>
              {displayResults.map((t: any) => {
                const id = t.id ?? t.issueId;
                const projectId = t.projectId;
                const key = t.key ?? "";
                const title = t.title;
                const status = t.status;
                const similarity = t.similarity;
                return (
                  <CommandItem
                    key={id}
                    value={`${key} ${title}`}
                    onSelect={() => {
                      setOpen(false);
                      navigate({
                        to: "/projects/$projectId/tickets/$ticketId",
                        params: { projectId, ticketId: id },
                      });
                    }}
                  >
                    {key && (
                      <span className="font-mono text-xs text-muted-foreground">{key}</span>
                    )}
                    <span className="truncate">{title}</span>
                    {status && <StatusChip status={status} className="ml-auto" />}
                    {useAI && similarity != null && (
                      <span className="ml-2 text-[0.6rem] text-violet-400 font-mono shrink-0">
                        {Math.round(similarity * 100)}%
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </header>
  );
}
