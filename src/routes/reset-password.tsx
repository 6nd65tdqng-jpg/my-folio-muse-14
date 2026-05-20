import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Use a password with at least 6 characters");
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Password updated");
    navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold text-foreground">Set password</h1>
          <p className="text-sm text-muted-foreground">
            Choose a password, then use it to sign in from the Home Screen app.
          </p>
        </div>
        <form onSubmit={updatePassword} className="space-y-3">
          <Input
            type="password"
            required
            minLength={6}
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
          />
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving…" : "Save password"}
          </Button>
        </form>
      </div>
    </div>
  );
}