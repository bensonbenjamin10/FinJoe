/**
 * Fetch system context (cost centers, categories, audit requirements) for FinJoe prompts.
 * Uses direct DB access via lib/finjoe-data.
 */

import { db } from "./db.js";
import { createFinJoeData } from "../../lib/finjoe-data.js";

const CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const contextCache = new Map<string, { context: string; at: number }>();

/** Fetch and format system context for injection into prompts */
export async function fetchSystemContext(tenantId: string): Promise<string> {
  const cached = contextCache.get(tenantId);
  if (cached && Date.now() - cached.at < CONTEXT_CACHE_TTL_MS) return cached.context;

  const finJoeData = createFinJoeData(db, tenantId);
  const [costCenters, categories, audit, settings] = await Promise.all([
    finJoeData.getCostCenters(),
    finJoeData.getExpenseCategories(),
    Promise.resolve(finJoeData.getAuditRequirements()),
    finJoeData.getFinJoeSettings(),
  ]);

  const costCenterLabel = settings?.costCenterLabel ?? "Cost Center";
  const costCenterList = costCenters?.map((c) => c.name).join(", ") || "Corporate Office";
  const categoryList = categories?.map((c) => c.name).join(", ") || "Operating Expenses";
  const auditDesc = audit
    ? `Required: ${audit.required.join(", ")}. Optional: ${audit.optional.join(", ")}. GSTIN: ${audit.gstinFormat}. Tax types: ${audit.taxTypes.join(", ")}.`
    : "Required: invoice number, date, vendor name. Optional: GSTIN (15 chars), tax type (no_gst, gst_itc, gst_rcm, gst_no_itc).";

  const context = `SYSTEM DATA:
${costCenterLabel}s: ${costCenterList}
Expense categories: ${categoryList}
Audit compliance: ${auditDesc}`;
  contextCache.set(tenantId, { context, at: Date.now() });
  return context;
}

/** Clear cached context (e.g. when config changes). Also invalidated by TTL. */
export function clearSystemContextCache(tenantId?: string) {
  if (tenantId) contextCache.delete(tenantId);
  else contextCache.clear();
}

export type CostCenterInfo = { id: string; name: string; slug: string };
export type CampusInfo = CostCenterInfo;
export type CategoryInfo = { id: string; name: string; slug: string };

/** Fetch structured cost centers and categories for validation and mapping */
export async function fetchSystemData(tenantId: string): Promise<{
  costCenters: CostCenterInfo[];
  campuses: CostCenterInfo[];
  categories: CategoryInfo[];
}> {
  const finJoeData = createFinJoeData(db, tenantId);
  const [costCenters, categories] = await Promise.all([
    finJoeData.getCostCenters(),
    finJoeData.getExpenseCategories(),
  ]);
  return {
    costCenters: costCenters ?? [],
    campuses: costCenters ?? [],
    categories: categories ?? [],
  };
}

/** Map user message/category name to category slug or id. Returns first match by slug, then by name. */
export function resolveCategoryFromMessage(
  message: string,
  categories: CategoryInfo[]
): string | null {
  const lower = message.trim().toLowerCase();
  if (!lower) return null;
  const bySlug = categories.find((c) => c.slug.toLowerCase() === lower || c.slug.toLowerCase().replace(/_/g, " ") === lower);
  if (bySlug) return bySlug.id;
  const byName = categories.find((c) => c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase()));
  if (byName) return byName.id;
  return null;
}

const CORPORATE_ALIASES = ["ho", "head office", "corporate", "hq", "corporate office"];

/** Map user message/cost center name to cost center id. */
export function resolveCostCenterFromMessage(
  message: string,
  costCenters: CostCenterInfo[]
): string | null {
  const lower = message.trim().toLowerCase();
  if (!lower) return null;
  if (CORPORATE_ALIASES.includes(lower)) return "__corporate__";
  const bySlug = costCenters.find((c) => c.slug.toLowerCase() === lower || c.slug.toLowerCase().replace(/-/g, " ") === lower);
  if (bySlug) return bySlug.id;
  const byName = costCenters.find((c) => c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase()));
  if (byName) return byName.id;
  return null;
}

/** Legacy alias for backward compatibility */
export const resolveCampusFromMessage = resolveCostCenterFromMessage;
