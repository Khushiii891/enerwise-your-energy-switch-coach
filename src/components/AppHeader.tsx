import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useEnerwise } from "@/store/enerwise";

const NAV = [
  { to: "/", short: "Home", full: "Recommendation" },
  { to: "/contract", short: "Contract", full: "My Contract" },
  { to: "/usage", short: "Usage", full: "My Usage" },
] as const;

export function AppHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useEnerwise();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Zap className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-base font-extrabold tracking-tight text-foreground">
              Enerwise
            </span>
            <span className="hidden text-[11px] font-medium text-muted-foreground sm:block">
              Switch smarter, not sooner
            </span>
          </span>
        </Link>

        {user && (
          <nav className="flex items-center gap-0.5 sm:gap-1">
            {NAV.map((item) => {
              const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:text-sm",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <span className="sm:hidden">{item.short}</span>
                  <span className="hidden sm:inline">{item.full}</span>
                </Link>
              );
            })}
            <button
              type="button"
              aria-label="Sign out"
              onClick={() => supabase.auth.signOut()}
              className="ml-1 rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}
