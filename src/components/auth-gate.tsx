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
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

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

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = code.trim();
    if (token.length < 6) {
      toast.error("Enter the 6-digit code from the email");
      return;
    }
    setVerifying(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: "email",
    });
    setVerifying(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // onAuthStateChange will flip session and render children.
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
            {sent
              ? "Check your email — you can either tap the magic link, or enter the 6-digit code below to sign in right here. The code is the easiest option if you've added this app to your Home Screen."
              : "Enter your email — we'll send you a magic link. No password needed."}
          </p>
        </div>
        {sent ? (
          <div className="space-y-4">
            <div className="rounded-md bg-muted p-3 text-sm text-foreground">
              Link sent to <span className="font-medium">{email}</span>
            </div>
            <form onSubmit={verifyCode} className="space-y-3">
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
              />
              <Button type="submit" className="w-full" disabled={verifying}>
                {verifying ? "Verifying…" : "Sign in with code"}
              </Button>
            </form>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setSent(false);
                setEmail("");
                setCode("");
              }}
            >
              Use a different email
            </Button>
          </div>
        ) : (
          <form onSubmit={sendLink} className="space-y-3">
            <Input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            <Button type="submit" className="w-full" disabled={sending}>
              {sending ? "Sending…" : "Send magic link"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
