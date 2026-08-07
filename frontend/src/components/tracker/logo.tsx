import { Blocks } from "lucide-react";
import { cn } from "@/lib/utils";

export function BlockWorkLogo({
  collapsed = false,
  size = "md",
  className,
}: {
  collapsed?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const iconSize = size === "sm" ? "size-7" : size === "lg" ? "size-11" : "size-9";
  const innerIconSize = size === "sm" ? "size-4" : size === "lg" ? "size-6" : "size-5";
  const textSize = size === "sm" ? "text-base" : size === "lg" ? "text-2xl" : "text-xl";
  const offset = size === "sm" ? "translate-x-0.5 translate-y-0.5" : "translate-x-1 translate-y-1";

  return (
    <div className={cn("flex items-center gap-3 select-none", className)}>
      {/* Double-layered neo-brutalist icon box matching the brand image */}
      <div className="relative shrink-0">
        {/* Back offset shadow box */}
        <div className={cn("absolute inset-0 bg-foreground rounded-sm", offset)} />
        {/* Front orange container */}
        <div
          className={cn(
            "relative flex items-center justify-center border-2 border-foreground bg-primary text-primary-foreground rounded-sm",
            iconSize
          )}
        >
          <Blocks className={cn("stroke-[2.5]", innerIconSize)} aria-hidden />
        </div>
      </div>
      {!collapsed && (
        <span className={cn("font-display font-black uppercase tracking-tight text-foreground", textSize)}>
          BLOCK WORK
        </span>
      )}
    </div>
  );
}
