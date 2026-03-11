import { useQuery } from "@tanstack/react-query";

export function useCostCenterLabel(tenantId?: string | null) {
  const { data: settings } = useQuery<{ costCenterLabel?: string | null; costCenterType?: string | null }>({
    queryKey: ["/api/admin/finjoe/settings", tenantId],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/finjoe/settings${tenantId ? `?tenantId=${tenantId}` : ""}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });
  return {
    costCenterLabel: settings?.costCenterLabel ?? "Cost Center",
    costCenterType: settings?.costCenterType ?? "campus",
  };
}
