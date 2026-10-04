import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Check, KeyRound, UserRound, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEnerwise } from "@/store/enerwise";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Account settings — Enerwise" },
      { name: "description", content: "Manage your Enerwise admin profile and password." },
      { property: "og:title", content: "Account settings — Enerwise" },
      { property: "og:description", content: "Manage your Enerwise admin profile and password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

export const PASSWORD_RULES = [
  { label: "At least 10 characters", test: (p: string) => p.length >= 10 },
  { label: "An uppercase and a lowercase letter", test: (p: string) => /[A-Z]/.test(p) && /[a-z]/.test(p) },
  { label: "A number", test: (p: string) => /\d/.test(p) },
  { label: "A symbol", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function fmt(d?: string | null) {
  return d ? new Date(d).toLocaleString("nl-NL") : "—";
}

function AccountPage() {
  const { user, isAdmin } = useEnerwise();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user || user.is_anonymous) {
    return <p className="py-20 text-center text-sm text-muted-foreground">Account settings are only available for signed-in admins.</p>;
  }

  const rulesOk = PASSWORD_RULES.every((r) => r.test(next));
  const matches = next.length > 0 && next === confirm;

  async function changePassword(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!rulesOk) { toast.error("The new password doesn't meet all the rules.");
    if (!matches) { toast.error("The new passwords don't match.");
    if (next === current) { toast.error("Choose a password different from your current one.");
    setBusy(true);
    const check = await supabase.auth.signInWithPassword({ email: user!.email!, password: current });
    if (check.error) {
      setBusy(false);
      { toast.error("Your current password is incorrect.");
    }
    const { error } = await supabase.auth.updateUser({ password: next, current_password: current });
    setBusy(false);
    if (error) { toast.error(error.message.includes("weak") || error.message.includes("pwned")
      ? "This password is too common or has appeared in a data leak. Choose another."
      : "Couldn't change your password. Please try again.");
    setCurrent(""); setNext(""); setConfirm("");
    toast.success("Password changed");
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 py-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Account settings</h1>
        <p className="text-sm text-muted-foreground">Your admin profile and password.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><UserRound className="h-4 w-4" /> Profile</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Email</dt><dd className="text-foreground">{user.email}</dd>
            <dt className="text-muted-foreground">Role</dt><dd className="text-foreground">{isAdmin ? "Admin" : "User"}</dd>
            <dt className="text-muted-foreground">Last sign-in</dt><dd className="tabular text-foreground">{fmt(user.last_sign_in_at)}</dd>
            <dt className="text-muted-foreground">Account created</dt><dd className="tabular text-foreground">{fmt(user.created_at)}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <form onSubmit={changePassword} className="flex flex-col gap-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><KeyRound className="h-4 w-4" /> Change password</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="current">Current password</Label>
              <Input id="current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new">New password</Label>
              <Input id="new" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
              <ul className="mt-1 flex flex-col gap-1 text-xs">
                {PASSWORD_RULES.map((r) => {
                  const ok = r.test(next);
                  return (
                    <li key={r.label} className={ok ? "flex items-center gap-1.5 text-primary" : "flex items-center gap-1.5 text-muted-foreground"}>
                      {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />} {r.label}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              {confirm && !matches && <p className="text-xs text-destructive">Passwords don't match.</p>}
            </div>
            <Button type="submit" disabled={busy || !rulesOk || !matches || !current}>
              {busy ? "Saving…" : "Change password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
