import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function Setup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "Admin User",
    email: "admin@yourorg.com",
    password: "",
    confirmPassword: "",
  });
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: "", color: "" });

  // Check setup status
  const { data: setupStatus, isLoading: checkingStatus } = useQuery<{
    setupComplete: boolean;
    needsSetup: boolean;
  }>({
    queryKey: ["/api/setup/status"],
  });

  // Redirect to login if setup is already complete
  useEffect(() => {
    if (setupStatus?.setupComplete) {
      setLocation("/login");
    }
  }, [setupStatus, setLocation]);

  // Calculate password strength
  useEffect(() => {
    const { password } = formData;
    if (!password) {
      setPasswordStrength({ score: 0, label: "", color: "" });
      return;
    }

    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    const strength = [
      { score: 0, label: "Too weak", color: "bg-red-500" },
      { score: 1, label: "Weak", color: "bg-orange-500" },
      { score: 2, label: "Fair", color: "bg-yellow-500" },
      { score: 3, label: "Good", color: "bg-blue-500" },
      { score: 4, label: "Strong", color: "bg-green-500" },
      { score: 5, label: "Very strong", color: "bg-green-600" },
    ][score];

    setPasswordStrength(strength);
  }, [formData.password]);

  const initializeMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; password: string }) => {
      const response = await fetch("/api/setup", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) {
        let message = "Setup failed";
        try {
          const errBody = (await response.json()) as { error?: string };
          message = errBody.error || message;
        } catch {
          /* non-JSON body */
        }
        throw new Error(message);
      }
      return response.json();
    },
    onSuccess: async () => {
      toast({ title: "Setup Complete!", description: "Redirecting to admin..." });
      await queryClient.invalidateQueries({ queryKey: ["/api/setup/status"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setTimeout(() => setLocation("/admin/dashboard"), 1500);
    },
    onError: (error: any) => {
      toast({
        title: "Setup Failed",
        description: error.message || "Failed to initialize production setup",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "Password and confirm password do not match",
        variant: "destructive",
      });
      return;
    }

    if (formData.password.length < 8) {
      toast({
        title: "Weak Password",
        description: "Password must be at least 8 characters long",
        variant: "destructive",
      });
      return;
    }

    if (passwordStrength.score < 2) {
      toast({
        title: "Weak Password",
        description: "Please choose a stronger password for better security",
        variant: "destructive",
      });
      return;
    }

    // Submit
    initializeMutation.mutate({
      name: formData.name,
      email: formData.email,
      password: formData.password,
    });
  };

  if (checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4 py-8">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4 py-8 md:py-12">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="text-center space-y-4 px-6 pt-8 md:px-8 md:pt-10">
          <div className="flex justify-center">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 md:w-10 md:h-10 text-primary" />
            </div>
          </div>
          <CardTitle className="font-display text-2xl md:text-3xl">
            Welcome to FinJoe — Your Finance AI, Ready in Minutes
          </CardTitle>
          <CardDescription className="text-base md:text-lg max-w-md mx-auto">
            Create your admin account to start managing expenses and income via WhatsApp.
          </CardDescription>
        </CardHeader>

        <CardContent className="px-6 pb-8 md:px-8 md:pb-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name Field */}
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter your full name"
                required
                data-testid="input-admin-name"
              />
            </div>

            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email">Admin Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="admin@yourorg.com"
                required
                data-testid="input-admin-email"
              />
              <p className="text-sm text-muted-foreground">
                This email will be used for admin login
              </p>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Enter a strong password"
                required
                minLength={8}
                data-testid="input-admin-password"
              />
              {formData.password && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Password strength:</span>
                    <span className={`font-medium ${
                      passwordStrength.score <= 1 ? "text-destructive" :
                      passwordStrength.score <= 2 ? "text-amber-600" :
                      "text-primary"
                    }`}>
                      {passwordStrength.label}
                    </span>
                  </div>
                  <Progress 
                    value={(passwordStrength.score / 5) * 100} 
                    className="h-2"
                  />
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                Use at least 8 characters with a mix of letters, numbers, and symbols
              </p>
            </div>

            {/* Confirm Password Field */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder="Re-enter your password"
                required
                data-testid="input-admin-confirm-password"
              />
            </div>

            {/* Info Box */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 md:p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">What happens next?</p>
                  <p>After setup, you&apos;ll land in the admin dashboard. This wizard won&apos;t be available again.</p>
                  <ul className="list-disc list-inside space-y-1 pt-1">
                    <li>Admin account created with your credentials</li>
                    <li>Organization&apos;s FinJoe database initialized</li>
                    <li>You&apos;ll be logged in to the admin dashboard</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full min-h-[48px]"
              size="lg"
              disabled={initializeMutation.isPending}
              data-testid="button-initialize-setup"
            >
              {initializeMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Initializing Production Setup...
                </>
              ) : (
                "Complete Setup"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
