import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { KeyRound, FolderPlus, Sparkles } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { graphqlRequest } from "@/lib/graphql-client";
import { useTracker } from "@/lib/tracker/store";

const CREATE_PROJECT_MUTATION = `
  mutation CreateProject($input: CreateProjectInput!) {
    createProject(input: $input) {
      id
      key
      name
      description
    }
  }
`;

const JOIN_PROJECT_MUTATION = `
  mutation JoinProjectWithCode($code: String!) {
    joinProjectWithCode(code: $code) {
      id
      key
      name
      description
    }
  }
`;

export function CreateOrJoinProjectDialog({ trigger }: { trigger: ReactNode }) {
  const { refetchData } = useTracker();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"create" | "join">("create");
  const [loading, setLoading] = useState(false);

  // Create form state
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");

  // Join form state
  const [code, setCode] = useState("");

  const handleNameChange = (val: string) => {
    setName(val);
    if (!key || key.length <= 3) {
      const derivedKey = val
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 3)
        .toUpperCase();
      if (derivedKey) setKey(derivedKey);
    }
  };

  const reset = () => {
    setName("");
    setKey("");
    setDescription("");
    setCode("");
    setLoading(false);
  };

  const handleCreateProject = async () => {
    if (!name.trim() || !key.trim()) {
      toast.error("Please enter a project name and key.");
      return;
    }

    setLoading(true);
    try {
      await graphqlRequest(CREATE_PROJECT_MUTATION, {
        input: {
          name: name.trim(),
          key: key.trim().toUpperCase(),
          description: description.trim(),
        },
      });

      toast.success(`Project "${name}" created successfully!`);
      await refetchData();
      setOpen(false);
      reset();
    } catch (err: any) {
      toast.error(err.message || "Failed to create project. Name must be unique.");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinProject = async () => {
    if (!code.trim()) {
      toast.error("Please enter a valid join passcode.");
      return;
    }

    setLoading(true);
    try {
      const res = await graphqlRequest<{
        joinProjectWithCode: { name: string; key: string };
      }>(JOIN_PROJECT_MUTATION, { code: code.trim().toUpperCase() });

      toast.success(`Successfully joined project "${res.joinProjectWithCode.name}"!`);
      await refetchData();
      setOpen(false);
      reset();
    } catch (err: any) {
      toast.error(err.message || "Invalid or expired join passcode.");
    } finally {
      setLoading(false);
    }
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl uppercase tracking-tight flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            Project Hub
          </DialogTitle>
          <DialogDescription>
            Create a new project or enter a join code provided by a team member.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "create" | "join")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create" className="gap-2">
              <FolderPlus className="size-4" />
              Create Project
            </TabsTrigger>
            <TabsTrigger value="join" className="gap-2">
              <KeyRound className="size-4" />
              Join via Passcode
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="proj-name">Project Name (Must be unique)</Label>
              <Input
                id="proj-name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Phoenix Mobile App"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="proj-key">Key (3 uppercase letters)</Label>
              <Input
                id="proj-key"
                value={key}
                maxLength={6}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                placeholder="PHX"
                className="font-mono uppercase"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="proj-desc">Description (Optional)</Label>
              <Textarea
                id="proj-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Goals, team notes, or scope..."
                rows={2}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateProject} disabled={loading}>
                {loading ? "Creating..." : "Create Project"}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="join" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="join-code">TOTP / Join Passcode</Label>
              <Input
                id="join-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. A9K3F7"
                className="font-mono text-center tracking-widest text-lg uppercase"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Ask a project admin to generate a join code from their Project Members settings.
              </p>
            </div>

            <DialogFooter className="pt-4">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleJoinProject} disabled={loading}>
                {loading ? "Joining..." : "Join Project"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
