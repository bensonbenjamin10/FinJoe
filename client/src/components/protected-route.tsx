import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireRoles?: string[];
}

export function ProtectedRoute({ children, requireAdmin = false, requireRoles }: ProtectedRouteProps) {
  const { user, isLoading, isAuthenticated, isAdmin } = useAuth();
  const [, setLocation] = useLocation();

  const hasRequiredRole = requireRoles
    ? user && requireRoles.includes(user.role)
    : requireAdmin
      ? isAdmin
      : true;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    } else if (!isLoading && (requireAdmin || requireRoles) && !hasRequiredRole) {
      setLocation(isAuthenticated ? "/admin/finjoe" : "/login");
    }
  }, [isLoading, isAuthenticated, hasRequiredRole, requireAdmin, requireRoles, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 pb-6 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if ((requireAdmin && !isAdmin) || (requireRoles && !hasRequiredRole)) {
    return null;
  }

  return <>{children}</>;
}
