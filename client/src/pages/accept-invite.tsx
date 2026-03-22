import { useState, useEffect } from "react";
import { useSearchParams, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const token = searchParams.get("token") || "";
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [strength, setStrength] = useState({ score: 0, label: "", color: "" });

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/auth/invite/validate?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (data.valid && data.email) setEmail(data.email);
      } catch {
        /* ignore */
      } finally {
        setChecking(false);
      }
    })();
  }, [token]);

  useEffect(() => {
    if (!password) {
      setStrength({ score: 0, label: "", color: "" });
      return;
    }
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    const labels = [
      { score: 0, label: "Too weak", color: "text-destructive" },
      { score: 1, label: "Weak", color: "text-destructive" },
      { score: 2, label: "Fair", color: "text-amber-600" },
      { score: 3, label: "Good", color: "text-primary" },
      { score: 4, label: "Strong", color: "text-primary" },
      { score: 5, label: "Very strong", color: "text-primary" },
    ][score];
    setStrength(labels);
  }, [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: "Weak password", description: "Use at least 8 characters", variant: "destructive" });
      return;
    }
    if (strength.score < 2) {
      toast({ title: "Weak password", description: "Choose a stronger password", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Mismatch", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to set password");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Welcome!", description: "Your password is set." });
      setTimeout(() => setLocation(data.loginFailed ? "/login" : "/admin/dashboard"), 800);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!token || !email) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid link</CardTitle>
            <CardDescription>This invitation link is missing or expired. Ask your admin to resend the invite.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/5 via-background to-primary/10">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>Set your password</CardTitle>
          <CardDescription>
            Account: <span className="font-medium text-foreground">{email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw">Password</Label>
              <Input
                id="pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              {password && (
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Strength</span>
                    <span className={strength.color}>{strength.label}</span>
                  </div>
                  <Progress value={(strength.score / 5) * 100} className="h-2" />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw2">Confirm password</Label>
              <Input
                id="pw2"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Continue to FinJoe
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
