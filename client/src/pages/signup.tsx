import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Loader2, Building2, UserPlus, ArrowLeft } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const INDUSTRIES = [
  "Education",
  "Healthcare",
  "Retail",
  "Manufacturing",
  "Non-Profit",
  "Professional Services",
  "Real Estate",
  "Technology",
  "Hospitality",
  "Other",
] as const;

function getPasswordStrength(password: string) {
  if (!password) return { score: 0, label: "", color: "" };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  return [
    { score: 0, label: "Too weak", color: "text-destructive" },
    { score: 1, label: "Weak", color: "text-destructive" },
    { score: 2, label: "Fair", color: "text-amber-600" },
    { score: 3, label: "Good", color: "text-primary" },
    { score: 4, label: "Strong", color: "text-primary" },
    { score: 5, label: "Very strong", color: "text-primary" },
  ][score];
}

export default function Signup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [form, setForm] = useState({
    orgName: "",
    industry: "",
    phone: "",
    address: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
    confirmPassword: "",
  });

  const [passwordStrength, setPasswordStrength] = useState(getPasswordStrength(""));

  useEffect(() => {
    setPasswordStrength(getPasswordStrength(form.adminPassword));
  }, [form.adminPassword]);

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const signupMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          orgName: data.orgName,
          industry: data.industry || undefined,
          phone: data.phone || undefined,
          address: data.address || undefined,
          adminName: data.adminName,
          adminEmail: data.adminEmail,
          adminPassword: data.adminPassword,
        }),
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Sign-up failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Welcome to FinJoe!", description: "Your organization has been created." });
      if (data.loginFailed) {
        setTimeout(() => setLocation("/login"), 1500);
      } else {
        setTimeout(() => setLocation("/admin/dashboard"), 1500);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Sign-up Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.orgName.trim()) {
      toast({ title: "Missing Field", description: "Organization name is required", variant: "destructive" });
      return;
    }
    if (!form.adminName.trim()) {
      toast({ title: "Missing Field", description: "Your name is required", variant: "destructive" });
      return;
    }
    if (!form.adminEmail.trim()) {
      toast({ title: "Missing Field", description: "Email is required", variant: "destructive" });
      return;
    }
    if (form.adminPassword.length < 8) {
      toast({ title: "Weak Password", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (passwordStrength.score < 2) {
      toast({ title: "Weak Password", description: "Please choose a stronger password", variant: "destructive" });
      return;
    }
    if (form.adminPassword !== form.confirmPassword) {
      toast({ title: "Password Mismatch", description: "Passwords do not match", variant: "destructive" });
      return;
    }

    signupMutation.mutate(form);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4 py-8 md:py-12">
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader className="text-center space-y-4 px-6 pt-8 md:px-8 md:pt-10">
          <div className="flex justify-center">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Building2 className="w-8 h-8 md:w-10 md:h-10 text-primary" />
            </div>
          </div>
          <CardTitle className="font-display text-2xl md:text-3xl">
            Create Your Organization
          </CardTitle>
          <CardDescription className="text-base md:text-lg max-w-md mx-auto">
            Set up your FinJoe account in under a minute. Manage expenses and income via WhatsApp AI.
          </CardDescription>
        </CardHeader>

        <CardContent className="px-6 pb-8 md:px-8 md:pb-10">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Organization Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                <Building2 className="h-4 w-4" />
                Organization Details
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="orgName">Organization Name *</Label>
                  <Input
                    id="orgName"
                    value={form.orgName}
                    onChange={update("orgName")}
                    placeholder="Acme Corp"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Select
                    value={form.industry}
                    onValueChange={(v) => setForm((f) => ({ ...f, industry: v }))}
                  >
                    <SelectTrigger id="industry">
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map((ind) => (
                        <SelectItem key={ind} value={ind}>
                          {ind}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={update("phone")}
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={form.address}
                    onChange={update("address")}
                    placeholder="123 Main St, City, Country"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Admin Account Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                <UserPlus className="h-4 w-4" />
                Admin Account
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="adminName">Full Name *</Label>
                  <Input
                    id="adminName"
                    value={form.adminName}
                    onChange={update("adminName")}
                    placeholder="Your full name"
                    required
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="adminEmail">Email *</Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    value={form.adminEmail}
                    onChange={update("adminEmail")}
                    placeholder="you@yourorg.com"
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    This will be your login email
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminPassword">Password *</Label>
                  <Input
                    id="adminPassword"
                    type="password"
                    value={form.adminPassword}
                    onChange={update("adminPassword")}
                    placeholder="Min. 8 characters"
                    required
                    minLength={8}
                  />
                  {form.adminPassword && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Strength:</span>
                        <span className={`font-medium ${passwordStrength.color}`}>
                          {passwordStrength.label}
                        </span>
                      </div>
                      <Progress value={(passwordStrength.score / 5) * 100} className="h-2" />
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password *</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={form.confirmPassword}
                    onChange={update("confirmPassword")}
                    placeholder="Re-enter password"
                    required
                  />
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full min-h-[48px]"
              size="lg"
              disabled={signupMutation.isPending}
            >
              {signupMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Your Organization...
                </>
              ) : (
                "Create My Organization"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Log in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
