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
        const error = await response.json();
        throw new Error(error.error || "Setup failed");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Setup Complete!", description: "Redirecting to admin..." });
      queryClient.invalidateQueries({ queryKey: ["/api/setup/status"] });
      setTimeout(() => setLocation("/admin/finjoe"), 1500);
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-3xl">Welcome to FinJoe</CardTitle>
          <CardDescription className="text-base">
            Set up your FinJoe admin account. Create your organization's first admin to manage contacts and the WhatsApp AI.
          </CardDescription>
        </CardHeader>

        <CardContent>
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
                      passwordStrength.score <= 2 ? "text-yellow-600" :
                      "text-green-600"
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
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="space-y-1 text-sm text-blue-900 dark:text-blue-100">
                  <p className="font-medium">What happens next?</p>
                  <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200">
                    <li>Admin account will be created with your credentials</li>
                    <li>Your organization's FinJoe database will be initialized</li>
                    <li>You'll be automatically logged in to the FinJoe admin dashboard</li>
                    <li>This setup wizard will become inaccessible after completion</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full"
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
