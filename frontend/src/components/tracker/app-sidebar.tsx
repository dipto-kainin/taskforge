import { Link, useRouterState } from "@tanstack/react-router";
import { CheckSquare, Columns3, LayoutDashboard, ListFilter, RotateCcw } from "lucide-react";
import { toast } from "sonner";

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

export function AppSidebar() {
  const { projects, tickets, resetDemoData } = useTracker();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
            FL
          </span>
          {!collapsed && (
            <span className="font-display text-sm font-semibold tracking-tight">Flightdeck</span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/"} tooltip="Dashboard">
                  <Link to="/">
                    <LayoutDashboard className="size-4" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
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
                        className="justify-between"
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className="font-mono text-[0.625rem] text-muted-foreground">
                            {project.key}
                          </span>
                          <span className="truncate">{project.name}</span>
                        </span>
                        {!collapsed && (
                          <span className="text-[0.625rem] text-muted-foreground">{count}</span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                    {open && (
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname.endsWith("/board")}
                          >
                            <Link to="/projects/$projectId/board" params={{ projectId: project.id }}>
                              <Columns3 className="size-3.5" />
                              <span>Board</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname.endsWith("/backlog")}
                          >
                            <Link
                              to="/projects/$projectId/backlog"
                              params={{ projectId: project.id }}
                            >
                              <ListFilter className="size-3.5" />
                              <span>Backlog</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname.endsWith("/todos")}>
                            <Link to="/projects/$projectId/todos" params={{ projectId: project.id }}>
                              <CheckSquare className="size-3.5" />
                              <span>Todos</span>
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

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Reset demo data"
              onClick={() => {
                resetDemoData();
                toast.success("Demo data reset");
              }}
            >
              <RotateCcw className="size-4" />
              <span>Reset demo data</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
