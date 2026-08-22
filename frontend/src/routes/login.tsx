import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { graphqlRequest } from "@/lib/graphql-client";
import { toast } from "sonner";
import { ArrowRight, Lock, Mail, User, Loader2 } from "lucide-react";
import { BlockWorkLogo } from "@/components/tracker/logo";
import { useServiceHealth, ServiceStatusWidget } from "@/components/tracker/service-status-widget";

const loginSearchSchema = z.object({
  invite: z.union([z.string(), z.number()]).optional(),
  email: z.string().optional(),
  token: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: zodValidator(loginSearchSchema),
  head: () => ({
    meta: [
      { title: "Login — Blockwork" },
      { name: "description", content: "Log in or sign up to access your Blockwork projects." },
    ],
  }),
  component: LoginComponent,
});

function LoginComponent() {
  const { login, register, isAuthenticated } = useAuth();
  const searchParams = Route.useSearch();
  const inviteProcessedRef = useRef(false);

  const { health, loading: healthLoading, refetch: refetchHealth } = useServiceHealth();

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const allHealthy = health?.allHealthy ?? false;

  // Pre-fill email & mode from invite link params
  useEffect(() => {
    if (searchParams.email) {
      setEmail(searchParams.email);
    }
    if (searchParams.invite !== undefined && String(searchParams.invite) === "1") {
      setIsRegisterMode(true);
    }
  }, [searchParams.email, searchParams.invite]);

  // Execute JWT temporal invite flow
  const processInviteFlow = async () => {
    if (inviteProcessedRef.current) return;
    inviteProcessedRef.current = true;

    if (!searchParams.token) {
      toast.error("Adding to project failed: missing invite token");
      window.location.href = "/";
      return;
    }

    try {
      const data = await graphqlRequest<{ joinProjectWithInvite: { id: string; name: string } }>(
        `mutation JoinProjectWithInvite($token: String!) {
          joinProjectWithInvite(token: $token) {
            id
            name
          }
        }`,
        { token: searchParams.token }
      );

      toast.success("Joined project successfully!");
      // Full location reload to board to clear query parameters & re-fetch fresh dashboard data
      window.location.href = `/projects/${data.joinProjectWithInvite.id}/board`;
    } catch (err: any) {
      // Failure case: error toast, DO NOT send any project ID, redirect to home and strip query params
      toast.error(`Adding to project failed: ${err?.message || "invalid or expired link"}`);
      window.location.href = "/";
    }
  };

  // If already authenticated when page opens, execute invite flow ONCE or redirect home
  useEffect(() => {
    if (isAuthenticated && !inviteProcessedRef.current) {
      if (searchParams.token) {
        processInviteFlow();
      } else {
        inviteProcessedRef.current = true;
        window.location.href = "/";
      }
    }
  }, [isAuthenticated, searchParams.token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allHealthy) {
      toast.error("Please wait for all cloud services to be ready before logging in.");
      return;
    }

    if (!email || !password || (isRegisterMode && !name)) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    try {
      if (isRegisterMode) {
        await register(email, password, name);
        toast.success("Account created successfully!");
      } else {
        await login(email, password);
        toast.success("Logged in successfully!");
      }

      if (searchParams.token) {
        await processInviteFlow();
      } else {
        inviteProcessedRef.current = true;
        window.location.href = "/";
      }
    } catch (err: any) {
      toast.error(err.message || "Authentication failed.");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[85vh] items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <BlockWorkLogo size="lg" />
          <h1 className="text-2xl font-bold font-display tracking-tight text-foreground uppercase mt-2">
            {isRegisterMode ? "Create an account" : "Welcome back to Block Work"}
          </h1>
          <p className="text-sm text-muted-foreground max-w-xs">
            {isRegisterMode
              ? "Sign up to start managing your projects & Kanban boards."
              : "Enter your credentials to access your workspaces."}
          </p>
        </div>

        {/* Microservice Live Status Tracker */}
        <ServiceStatusWidget health={health} loading={healthLoading} refetch={refetchHealth} />

        <div className="rounded-xl border border-border bg-card p-6 shadow-xl backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegisterMode && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alice Smith"
                    className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alice@example.com"
                  className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !allHealthy}
              className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Processing...
                </>
              ) : !allHealthy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Waking up cloud services...
                </>
              ) : (
                <>
                  {isRegisterMode ? "Sign Up" : "Log In"}
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <div className="text-center text-xs text-muted-foreground">
          {isRegisterMode ? "Already have an account?" : "Don't have an account yet?"}{" "}
          <button
            type="button"
            onClick={() => setIsRegisterMode(!isRegisterMode)}
            className="font-medium text-primary hover:underline"
          >
            {isRegisterMode ? "Log In" : "Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );
}
