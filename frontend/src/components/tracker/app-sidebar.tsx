import { Link, useRouterState } from "@tanstack/react-router";
import { Columns3, Home, ListFilter, ListTodo, Plus, UserCheck, Users } from "lucide-react";
import { CreateOrJoinProjectDialog } from "@/components/tracker/create-or-join-project-dialog";


import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useTracker } from "@/lib/tracker/store";

import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { BlockWorkLogo } from "@/components/tracker/logo";

export function AppSidebar() {
  const { projects, tickets } = useTracker();
  const auth = useAuth();
  const myId = auth?.user?.id ?? "";
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const assignedCount = tickets.filter(
    (t) => t.assigneeId === myId && t.status !== "done",
  ).length;

  return (
    <Sidebar collapsible="icon" className="border-r-2 border-foreground">
      <SidebarHeader className="h-14 flex items-center justify-center border-b border-border">
        <Link to="/" className="flex items-center justify-center">
          <BlockWorkLogo collapsed={collapsed} size="sm" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="py-1.5">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/"} tooltip="Home">
                  <Link to="/" className="flex items-center gap-2">
                    <Home className="size-4 shrink-0" />
                    {!collapsed && <span>Home</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/assigned"}
                  tooltip="My Assigned"
                >
                  <Link to="/assigned" className="flex items-center justify-between w-full">
                    <span className="flex items-center gap-2">
                      <UserCheck className="size-4 shrink-0" />
                      {!collapsed && <span>My Assigned</span>}
                    </span>
                    {!collapsed && (
                      <span className="border-2 border-foreground bg-secondary px-1.5 text-[0.625rem] font-bold">
                        {assignedCount}
                      </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="w-full border-t border-border/60" />

        <SidebarGroup className="pt-1 pb-1.5">
          <div className="flex items-center justify-between px-2 mb-2">
            <SidebarGroupLabel className="h-6 pt-0 font-display font-bold text-xs uppercase tracking-wider text-foreground px-0">
              Projects
            </SidebarGroupLabel>
            {!collapsed && (
              <CreateOrJoinProjectDialog
                trigger={
                  <button
                    type="button"
                    title="Create or Join Project"
                    className="inline-flex size-5 items-center justify-center rounded border border-foreground bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="size-3.5" />
                  </button>
                }
              />
            )}
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.map((project) => {
                const active = pathname.startsWith(`/projects/${project.id}`);
                const open = active && !collapsed;
                const count = tickets.filter(
                  (t) => t.projectId === project.id && t.status !== "done",
                ).length;
                return (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton asChild isActive={active} tooltip={project.name}>
                      <Link
                        to="/projects/$projectId/board"
                        params={{ projectId: project.id }}
                        className={cn("w-full", !collapsed && "justify-between")}
                      >
                        {collapsed ? (
                          <span className="font-mono text-[0.6875rem] font-black uppercase text-foreground tracking-tight">
                            {project.key.slice(0, 3)}
                          </span>
                        ) : (
                          <>
                            <span className="flex items-center gap-2 truncate min-w-0">
                              <span className="inline-flex items-center justify-center rounded-sm bg-muted/90 px-1.5 h-4.5 font-mono text-[0.625rem] font-bold uppercase text-muted-foreground border border-border/60 shrink-0 leading-none pt-[2px]">
                                {project.key}
                              </span>
                              <span className="truncate text-sm font-medium text-foreground">{project.name}</span>
                            </span>
                            <span className="text-[0.625rem] font-bold text-muted-foreground shrink-0 leading-none">
                              {count}
                            </span>
                          </>
                        )}
                      </Link>
                    </SidebarMenuButton>
                    {open && (
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname.endsWith("/board")}>
                            <Link to="/projects/$projectId/board" params={{ projectId: project.id }}>
                              <Columns3 className="size-3.5" />
                              <span>Kanban Board</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname.endsWith("/backlog")}>
                            <Link
                              to="/projects/$projectId/backlog"
                              params={{ projectId: project.id }}
                            >
                              <ListTodo className="size-3.5" />
                              <span>Backlog</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname.endsWith("/issues")}>
                            <Link
                              to="/projects/$projectId/issues"
                              params={{ projectId: project.id }}
                            >
                              <ListFilter className="size-3.5" />
                              <span>Issues</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname.endsWith("/members")}>
                            <Link
                              to={"/projects/$projectId/members" as any}
                              params={{ projectId: project.id } as any}
                            >
                              <Users className="size-3.5" />
                              <span>Members</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

    </Sidebar>
  );
}
