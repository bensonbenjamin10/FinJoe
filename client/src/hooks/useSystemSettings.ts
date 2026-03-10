import { useQuery } from "@tanstack/react-query";
import type { SystemSettings } from "@shared/schema";

export function useSystemSettings() {
  const { data: settings, isLoading, error } = useQuery<SystemSettings>({
    queryKey: ["/api/system-settings"],
    staleTime: 5 * 60 * 1000, // 5 minutes - system settings don't change often
  });

  return {
    settings,
    isLoading,
    error,
    supportPhone: settings?.supportPhone || undefined,
    supportWhatsApp: settings?.supportWhatsApp || undefined,
  };
}
