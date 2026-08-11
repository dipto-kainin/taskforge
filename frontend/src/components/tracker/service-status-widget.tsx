import { useState, useEffect, useCallback } from "react";
import { Activity, CheckCircle2, AlertCircle, RefreshCw, Server, Zap } from "lucide-react";

export interface ServiceStatus {
  name: string;
  status: "ok" | "waking_up" | "error" | "disabled";
  critical: boolean;
}

export interface HealthCheckResult {
  status: "ok" | "degraded" | "down";
  allHealthy: boolean;
  services: ServiceStatus[];
}

const GRAPHQL_URL =
  (import.meta.env && import.meta.env["VITE_GRAPHQL_URL"]) || "http://localhost:4000/graphql";
const HEALTH_URL = GRAPHQL_URL.replace(/\/graphql\/?$/, "/health");

export function useServiceHealth() {
  const [health, setHealth] = useState<HealthCheckResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(HEALTH_URL, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: HealthCheckResult = await res.json();
      setHealth(data);
    } catch (err: any) {
      setHealth({
        status: "down",
        allHealthy: false,
        services: [
          { name: "Gateway", status: "waking_up", critical: true },
          { name: "Auth Service", status: "waking_up", critical: true },
          { name: "Core Service", status: "waking_up", critical: true },
        ],
      });
      setError(err.name === "AbortError" ? "Gateway timeout" : err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();

    // Poll every 4 seconds if health is not completely healthy
    const interval = setInterval(() => {
      checkHealth();
    }, 4000);

    return () => clearInterval(interval);
  }, [checkHealth]);

  return { health, loading, error, refetch: checkHealth };
}

export function ServiceStatusWidget({
  health,
  loading,
  refetch,
}: {
  health: HealthCheckResult | null;
  loading: boolean;
  refetch: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!health) return null;

  const { allHealthy, services } = health;
  const readyCount = services.filter((s) => s.critical && s.status === "ok").length;
  const criticalCount = services.filter((s) => s.critical).length;

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 shadow-sm backdrop-blur-md transition-all">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative flex size-2.5 items-center justify-center">
            {allHealthy ? (
              <>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </>
            ) : (
              <>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
              </>
            )}
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Server className="size-3.5" />
            Backend System Status
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-mono font-medium ${
              allHealthy
                ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
            }`}
          >
            {allHealthy
              ? "All Systems Operational"
              : `Waking Up (${readyCount}/${criticalCount})`}
          </span>

          <button
            type="button"
            onClick={refetch}
            disabled={loading}
            title="Refresh Service Status"
            className="p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 pt-3 border-t border-border/50 text-xs">
        {services.map((service) => {
          const isOk = service.status === "ok";
          const isWaking = service.status === "waking_up";
          const isDisabled = service.status === "disabled";

          return (
            <div
              key={service.name}
              className="flex items-center justify-between rounded-lg bg-background/50 px-2.5 py-1.5 border border-border/40"
            >
              <span className="font-medium text-foreground truncate">{service.name}</span>

              {isOk && (
                <span className="flex items-center gap-1 text-emerald-500 font-mono text-[10px]">
                  <CheckCircle2 className="size-3" />
                  Ready
                </span>
              )}

              {isWaking && (
                <span className="flex items-center gap-1 text-amber-500 font-mono text-[10px] animate-pulse">
                  <Activity className="size-3 animate-spin" />
                  Waking...
                </span>
              )}

              {isDisabled && (
                <span className="text-muted-foreground font-mono text-[10px]">
                  Disabled
                </span>
              )}

              {service.status === "error" && (
                <span className="flex items-center gap-1 text-rose-500 font-mono text-[10px]">
                  <AlertCircle className="size-3" />
                  Down
                </span>
              )}
            </div>
          );
        })}
      </div>

      {!allHealthy && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400 border border-amber-500/20">
          <Zap className="size-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Cloud services are starting up</p>
            <p className="text-[11px] opacity-90 mt-0.5">
              Render free tier services sleep when idle. Please wait ~15-20 seconds for services to become ready before logging in.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
