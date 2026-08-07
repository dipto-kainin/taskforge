import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { User as UserIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTracker } from "@/lib/tracker/store";
import { PRIORITIES, STATUSES, type Priority, type Status } from "@/lib/tracker/types";

export function NewTicketDialog({
  projectId,
  defaultStatus = "backlog",
  trigger,
}: {
  projectId: string;
  defaultStatus?: Status;
  trigger: ReactNode;
}) {
  const { users, projects, createTicket } = useTracker();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>(defaultStatus);
  const [priority, setPriority] = useState<Priority>("medium");
  const [assigneeId, setAssigneeId] = useState<string>("unassigned");
  const [labels, setLabels] = useState("");
  const [targetProject, setTargetProject] = useState(projectId);

  const reset = () => {
    setTitle("");
    setDescription("");
    setStatus(defaultStatus);
    setPriority("medium");
    setAssigneeId("unassigned");
    setLabels("");
    setTargetProject(projectId);
  };

  const submit = () => {
    if (!title.trim()) {
      toast.error("Give the ticket a title first.");
      return;
    }
    const ticket = createTicket({
      projectId: targetProject,
      title,
      description,
      status,
      priority,
      assigneeId: assigneeId === "unassigned" ? null : assigneeId,
      labels: labels
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean),
    });
    toast.success(`Created ${ticket?.key ?? "issue"}`);
    reset();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New issue</DialogTitle>
          <DialogDescription>Add an issue to the board. You can edit every field later.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="nt-title">Title</Label>
            <Input
              id="nt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Fix GraphQL user permissions endpoint"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nt-desc">Details</Label>
            <Textarea
              id="nt-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What needs to be done, requirements, links..."
              rows={3}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Project</Label>
              <Select value={targetProject} onValueChange={setTargetProject}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.key} · {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Board column</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger id="assignee-select-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">
                    <span className="flex items-center gap-2">
                      <UserIcon className="size-4 text-muted-foreground" />
                      <span>Unassigned</span>
                    </span>
                  </SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      <span className="flex items-center gap-2">
                        <Avatar className="size-5 border border-foreground">
                          <AvatarImage src={u.avatarUrl ?? undefined} />
                          <AvatarFallback className="bg-primary text-[0.6rem] font-bold">
                            {u.initials}
                          </AvatarFallback>
                        </Avatar>
                        <span>{u.name}</span>
                        {u.role && (
                          <Badge variant="outline" className="text-[0.6rem] uppercase py-0 px-1 border-foreground">
                            {u.role}
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nt-labels">Tags</Label>
            <Input
              id="nt-labels"
              value={labels}
              onChange={(e) => setLabels(e.target.value)}
              placeholder="beast, escort (comma separated)"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Create issue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
