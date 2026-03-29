import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId?: string | null;
  campusId?: string | null;
  realTenantId?: string | null;
  /** Present when /api/auth/me joins tenant row */
  isDemoTenant?: boolean;
  /** ISO date when demo workspace expires (demo tenants only) */
  demoExpiresAt?: string | null;
  isActive: boolean;
}

export function useAuth() {
  const [, setLocation] = useLocation();

  const { data: user, isLoading, error } = useQuery<User | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const response = await fetch("/api/auth/me");
      if (!response.ok) {
        if (response.status === 401) {
          return null;
        }
        throw new Error("Failed to fetch user");
      }
      return response.json();
    },
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/logout", {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      setLocation("/login");
    },
  });

  const EXPENSE_ROLES = ["admin", "finance", "campus_coordinator", "head_office"];
  const APPROVE_ROLES = ["admin", "finance"];

  const isTenantStaff =
    !!user && (user.role === "super_admin" || EXPENSE_ROLES.includes(user.role));
  const isTenantAdmin = !!user && (user.role === "admin" || user.role === "super_admin");

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isAdmin: user?.role === "admin",
    isTenantAdmin,
    isTenantStaff,
    hasExpenseAccess: isTenantStaff,
    canApproveExpenses: !!user && (user.role === "super_admin" || APPROVE_ROLES.includes(user.role)),
    canImportExpenses: !!user && (user.role === "super_admin" || APPROVE_ROLES.includes(user.role)),
    logout: () => logoutMutation.mutate(),
    isLoggingOut: logoutMutation.isPending,
  };
}
