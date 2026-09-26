import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { generateRationale, submitFeedback, type RationaleResult } from "@/lib/rationale.functions";
import { useEnerwise } from "@/store/enerwise";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export function AiRationale({ positive }: { positive: boolean }) {
  const { version, user } = useEnerwise();
  const userId = user?.id;
  const gen = useServerFn(generateRationale);
  const sendFeedback = useServerFn(submitFeedback);
  const [lang, setLang] = useState<"en" | "nl">("en");
  const [result, setResult] = useState<RationaleResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [voted, setVoted] = useState<boolean | null>(null);
  const reqId = useRef(0);

  const run = useCallback(
    async (force: boolean) => {
      if (!userId) return;
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) return;
      const id = ++reqId.current;
      setLoading(true);
      setVoted(null);
      try {
        const r = await gen({ data: { lang, force } });
        if (id === reqId.current) setResult(r);
      } catch {
        if (id === reqId.current) toast.error("Couldn't load the explanation.");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [gen, lang, userId],
  );

  useEffect(() => {
    run(false);
  }, [run, version]);

  async function vote(helpful: boolean) {
    if (!result?.id) return;
    setVoted(helpful);
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return;
    try {
      await sendFeedback({ data: { recommendationId: result.id, helpful } });
      toast.success("Thanks for your feedback");
    } catch {
      setVoted(null);
      toast.error("Couldn't save feedback");
    }
  }

  return (
    <div className="max-w-xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
          My Recommendation
        </span>
        <div className="ml-auto flex rounded-full border border-border p-0.5 text-[11px] font-semibold">
          {(["en", "nl"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={cn(
                "rounded-full px-2 py-0.5 uppercase",
                lang === l ? "bg-primary/10 text-primary" : "text-muted-foreground",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading && !result ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-4/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : result ? (
        <div className={cn("transition-opacity", loading && "opacity-50")}>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            {result.headline}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{result.rationale}</p>
          {result.caveat && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground/80">{result.caveat}</p>
          )}
        </div>
      ) : (
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          {positive ? "Now looks like a good time to switch" : "Your current contract still wins — for now"}
        </h1>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-muted-foreground">
          {result?.isFallback
            ? "Standard explanation — numbers calculated by Enerwise"
            : "AI-generated explanation — numbers calculated by Enerwise"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => run(true)} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Regenerate
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Helpful"
            disabled={!result?.id || voted !== null}
            onClick={() => vote(true)}
            className={cn(voted === true && "text-success")}
          >
            <ThumbsUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Not helpful"
            disabled={!result?.id || voted !== null}
            onClick={() => vote(false)}
            className={cn(voted === false && "text-destructive")}
          >
            <ThumbsDown className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
