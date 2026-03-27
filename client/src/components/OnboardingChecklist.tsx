import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const ONBOARDING_DISMISSED_KEY = "finjoe-onboarding-dismissed";

function getDismissedTenants(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(ONBOARDING_DISMISSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function setDismissed(tenantId: string, dismissed: boolean) {
  if (typeof window === "undefined") return;
  const set = getDismissedTenants();
  if (dismissed) set.add(tenantId);
  else set.delete(tenantId);
  localStorage.setItem(ONBOARDING_DISMISSED_KEY, JSON.stringify([...set]));
}

interface OnboardingChecklistProps {
  tenantId: string | null;
  currentTab: string;
  /** Navigate to a FinJoe checklist tab (maps to path-based routes). */
  onNavigateToTab: (tab: string) => void;
}

export function OnboardingChecklist({ tenantId, currentTab, onNavigateToTab }: OnboardingChecklistProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [dismissedInSession, setDismissedInSession] = useState(false);

  useEffect(() => {
    setDismissedInSession(tenantId ? getDismissedTenants().has(tenantId) : false);
  }, [tenantId]);

  const { data: settings } = useQuery<{ costCenterLabel?: string | null }>({
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

  const { data: costCenters = [] } = useQuery({
    queryKey: ["/api/admin/cost-centers", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/cost-centers${tenantId ? `?tenantId=${tenantId}` : ""}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["/api/admin/finjoe/contacts", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/finjoe/contacts${tenantId ? `?tenantId=${tenantId}` : ""}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: whatsappProvider } = useQuery({
    queryKey: ["/api/admin/finjoe/whatsapp-provider", tenantId],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/finjoe/whatsapp-provider${tenantId ? `?tenantId=${tenantId}` : ""}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: expenseCategories = [] } = useQuery({
    queryKey: ["/api/admin/expense-categories", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/expense-categories${tenantId ? `?tenantId=${tenantId}` : ""}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: incomeCategories = [] } = useQuery({
    queryKey: ["/api/admin/income-categories", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/income-categories${tenantId ? `?tenantId=${tenantId}` : ""}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: incomeTypes = [] } = useQuery({
    queryKey: ["/api/admin/income-types", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/income-types${tenantId ? `?tenantId=${tenantId}` : ""}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: tenantUsers = [] } = useQuery<{ role: string }[]>({
    queryKey: ["/api/admin/tenant-users", tenantId],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/tenant-users${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`,
        { credentials: "include" }
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantId,
  });

  const [, setLocation] = useLocation();

  if (!tenantId) return null;

  const hasCostCenterLabel = !!(settings?.costCenterLabel && settings.costCenterLabel.trim());
  const hasCostCenters = costCenters.length > 0;
  const hasContacts = contacts.length > 0;
  const hasWhatsApp = !!(whatsappProvider?.whatsappFrom && whatsappProvider.whatsappFrom.trim());
  const hasExpenseCategories = expenseCategories.length > 0;
  const hasIncomeCategories = incomeCategories.length > 0;
  const hasIncomeTypes = incomeTypes.length > 0;
  const hasStaffDashboardUsers = tenantUsers.some((u) =>
    ["finance", "campus_coordinator", "cost_center_coordinator", "head_office"].includes(u.role)
  );

  const staffRoles = ["admin", "finance", "head_office", "campus_coordinator", "cost_center_coordinator"];
  const staffContacts = contacts.filter((c: { role: string; studentId?: string | null }) =>
    staffRoles.includes(c.role)
  );
  const allStaffContactsLinked =
    staffContacts.length > 0 &&
    staffContacts.every((c: { studentId?: string | null }) => !!c.studentId);

  const allComplete =
    hasCostCenterLabel &&
    hasCostCenters &&
    hasContacts &&
    hasStaffDashboardUsers &&
    allStaffContactsLinked &&
    hasWhatsApp &&
    hasExpenseCategories &&
    hasIncomeCategories &&
    hasIncomeTypes;
  const dismissed = dismissedInSession || getDismissedTenants().has(tenantId);

  if (dismissed) return null;

  const steps = [
    {
      id: "settings",
      label: "Configure cost center labels",
      done: hasCostCenterLabel,
      tab: "settings",
    },
    {
      id: "cost-centers",
      label: "Add cost centers",
      done: hasCostCenters,
      tab: "cost-centers",
    },
    {
      id: "dashboard-users",
      label: "Add staff dashboard users (finance, coordinators)",
      done: hasStaffDashboardUsers,
      tab: "team",
    },
    {
      id: "contacts",
      label: "Add FinJoe contacts",
      done: hasContacts,
      tab: "contacts",
    },
    {
      id: "link-contacts",
      label: "Link dashboard users to staff contacts",
      done: allStaffContactsLinked,
      tab: "contacts",
    },
    {
      id: "whatsapp",
      label: "Configure WhatsApp",
      done: hasWhatsApp,
      tab: "settings",
    },
    {
      id: "expense-categories",
      label: "Add or seed expense categories",
      done: hasExpenseCategories,
      navigateTo: `/admin/expenses?tenantId=${tenantId}`,
    },
    {
      id: "income-categories",
      label: "Add income categories",
      done: hasIncomeCategories,
      navigateTo: `/admin/income?tenantId=${tenantId}`,
    },
    {
      id: "income-types",
      label: "Configure income types",
      done: hasIncomeTypes,
      navigateTo: `/admin/income?tenantId=${tenantId}`,
    },
  ];

  return (
    <Card className="mb-6 border-primary/30 bg-primary/5">
      <CardHeader
        className="cursor-pointer py-4"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-medium">Getting started</CardTitle>
            <span className="text-sm text-muted-foreground">
              {steps.filter((s) => s.done).length} of {steps.length} complete
            </span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
        <CardDescription>
          Complete these steps to set up FinJoe for your organization.
        </CardDescription>
      </CardHeader>
      {!collapsed && (
        <CardContent className="pt-0 space-y-2">
          {steps.map((step) => (
            <div
              key={step.id}
              className={cn(
                "flex items-center gap-3 py-2 px-3 rounded-md",
                step.done ? "text-muted-foreground" : "bg-background/50"
              )}
            >
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
              )}
              <span className={cn("flex-1", step.done && "line-through")}>{step.label}</span>
              {!step.done && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => {
                    if ("navigateTo" in step && step.navigateTo) {
                      setLocation(step.navigateTo);
                    } else if ("tab" in step) {
                      onNavigateToTab(step.tab);
                    }
                  }}
                >
                  Go
                </Button>
              )}
            </div>
          ))}
          {steps.every((s) => s.done) && (
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDismissed(tenantId, true);
                  setDismissedInSession(true);
                }}
              >
                Dismiss
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
