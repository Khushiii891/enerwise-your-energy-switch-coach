import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEnerwise } from "@/store/enerwise";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Start — Enerwise" },
      { name: "description", content: "Start Enerwise as a guest to get timing-aware energy switch advice." },
      { property: "og:title", content: "Start — Enerwise" },
      { property: "og:description", content: "Continue as a guest and see if now is the right time to switch energy supplier." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user } = useEnerwise();
  const navigate = useNavigate();
  const [showAdmin, setShowAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/" });
  }, [user, navigate]);

  async function continueAsGuest() {
    setBusy(true);
    const { error } = await supabase.auth.signInAnonymously();
    setBusy(false);
    if (error) toast.error("Couldn't start a guest session. Please try again.");
  }

  async function adminSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/admin" });
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Zap className="h-6 w-6" />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Welcome to Enerwise</h1>
        <p className="text-sm text-muted-foreground">
          Find out whether now is the right moment to switch energy supplier. Your answers stay in
          your own private session.
        </p>
      </div>

      <Button size="lg" className="h-14 text-base" onClick={continueAsGuest} disabled={busy}>
        Continue as guest <ArrowRight className="h-5 w-5" />
      </Button>

      {!showAdmin ? (
        <button
          type="button"
          onClick={() => setShowAdmin(true)}
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Admin login
        </button>
      ) : (
        <Card>
          <CardContent className="p-5">
            <form onSubmit={adminSignIn} className="flex flex-col gap-4">
              <p className="text-sm font-semibold text-foreground">Admin login</p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" variant="outline" disabled={busy}>
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
