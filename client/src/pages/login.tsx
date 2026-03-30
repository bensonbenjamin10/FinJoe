import { useState, useEffect } from "react";
import { useLocation, Link, useSearchParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, LogIn } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

function safePostLoginRedirect(raw: string | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  const p = raw.trim();
  if (!p.startsWith("/") || p.startsWith("//")) return null;
  if (p.includes("://")) return null;
  return p;
}

export default function Login() {
  const [, setLocation] = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  // Check if setup is needed
  const { data: setupStatus } = useQuery<{
    setupComplete: boolean;
    needsSetup: boolean;
  }>({
    queryKey: ["/api/setup/status"],
  });

  useEffect(() => {
    if (setupStatus?.needsSetup) setLocation("/setup");
  }, [setupStatus, setLocation]);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const response = await apiRequest("POST", "/api/auth/login", data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Login failed");
      }
      return response.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/me"], user);
      toast({
        title: "Login successful",
        description: `Welcome back, ${user.name}!`,
      });
      const next = safePostLoginRedirect(searchParams.get("redirect"));
      setLocation(next ?? "/admin/dashboard");
    },
    onError: (error: Error) => {
      setError(error.message);
    },
  });

  const onSubmit = (data: LoginFormData) => {
    setError(null);
    loginMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8 md:py-12">
      <Card className="w-full max-w-md shadow-lg" data-testid="card-login">
        <CardHeader className="space-y-2 px-6 pt-8 md:px-8 md:pt-10">
          <CardTitle className="font-display text-2xl font-bold text-center md:text-3xl">
            FinJoe Admin
          </CardTitle>
          <CardDescription className="text-center text-base">
            Sign in to manage your organization&apos;s Finance Joe — contacts, settings, and WhatsApp integration.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-8 md:px-8 md:pb-10">
          {error && (
            <Alert variant="destructive" className="mb-4" data-testid="alert-error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="admin@yourorg.com"
                        {...field}
                        data-testid="input-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Enter your password"
                        {...field}
                        data-testid="input-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full min-h-[48px]"
                disabled={loginMutation.isPending}
                data-testid="button-login"
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Sign In
                  </>
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center text-sm text-muted-foreground space-y-2">
            <div>
              <Link href="/forgot-password" className="text-primary underline-offset-4 hover:underline">
                Forgot password?
              </Link>
            </div>
            <div>Need access? Contact your organization admin.</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
