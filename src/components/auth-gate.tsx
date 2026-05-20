import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Props {
  children: ReactNode;
}

export function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    // Set up listener BEFORE getSession (per Supabase docs).
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setChecking(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) return;
    if (mode === "sign-up" && password.length < 6) {
      toast.error("Use a password with at least 6 characters");
      return;
    }

    setSending(true);
    setNotice("");
    const { error } =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          })
        : await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: { emailRedirectTo: window.location.origin },
          });
    setSending(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    if (mode === "sign-up") {
      setMode("sign-in");
      setPassword("");
      setNotice("Check your email to confirm the account, then come back here and sign in with your password.");
      toast.success("Account created");
    }
  };

  const resetPassword = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      toast.error("Enter your email first");
      return;
    }

    setSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSending(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    setNotice("Password reset email sent. Open it, set a password, then sign in here from the Home Screen app.");
    toast.success("Password reset email sent");
  };

  const sendMagicLink = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      toast.error("Enter your email first");
      return;
    }

    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    setNotice("Magic link sent. If the Home Screen app asks again, use password sign-in instead.");
    toast.success("Magic link sent");
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (session) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold text-foreground">
            AM Portfolio Tracker
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in with a password so the Home Screen app can keep you logged in.
          </p>
        </div>
        {notice ? (
          <div className="rounded-md bg-muted p-3 text-sm text-foreground">
            {notice}
          </div>
        ) : null}
        <form onSubmit={submitPassword} className="space-y-3">
          <Input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
          />
          <Input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            minLength={mode === "sign-up" ? 6 : undefined}
          />
          <Button type="submit" className="w-full" disabled={sending}>
            {sending ? "Working…" : mode === "sign-in" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={sending}
            onClick={() => {
              setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              setPassword("");
              setNotice("");
            }}
          >
            {mode === "sign-in" ? "Create an account" : "I already have an account"}
          </Button>
          <Button type="button" variant="ghost" className="w-full" disabled={sending} onClick={resetPassword}>
            Set or reset password
          </Button>
          <Button type="button" variant="ghost" className="w-full" disabled={sending} onClick={sendMagicLink}>
            Email me a magic link instead
          </Button>
        </div>
      </div>
    </div>
  );
}
