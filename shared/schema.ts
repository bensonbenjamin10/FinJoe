/**
 * FinJoe standalone schema - duplicated from MedPGBuddy for independence.
 * Uses users instead of students, finjoe_settings instead of system_settings.
 */

import { sql } from "drizzle-orm";
import {
  customType,
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Tenants (organizations)
export const tenants = pgTable("tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  industry: text("industry"),
  phone: text("phone"),
  address: text("address"),
  contactEmail: text("contact_email"),
  isActive: boolean("is_active").notNull().default(true),
  taxRegime: text("tax_regime").notNull().default("flat_percent"),
  taxRegimeConfig: jsonb("tax_regime_config").$type<Record<string, unknown>>().default({}),
  createdById: varchar("created_by_id"),
  updatedById: varchar("updated_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Tenant WABA provider credentials (Twilio, 360dialog, MessageBird, etc.)
export const tenantWabaProviders = pgTable("tenant_waba_providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  whatsappFrom: text("whatsapp_from").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Cost Centers - tenant-configurable (campus, branch, department, etc.)
export const costCenters = pgTable("cost_centers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  type: varchar("type"),
  isActive: boolean("is_active").notNull().default(true),
  /** Default supplier GSTIN for AR invoices when tax regime is India GST (multi-branch). */
  billingGstin: text("billing_gstin"),
  /** Optional 2-digit state code override when billing GSTIN is absent. */
  billingStateCode: text("billing_state_code"),
  createdById: varchar("created_by_id"),
  updatedById: varchar("updated_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Legacy alias for backward compatibility
export const campuses = costCenters;

// Users - FinJoe's equivalent of students (admin, finance, etc.). tenant_id null = super_admin
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("admin"),
  costCenterId: varchar("cost_center_id").references(() => costCenters.id),
  isActive: boolean("is_active").notNull().default(true),
  inviteTokenHash: text("invite_token_hash"),
  inviteTokenExpiresAt: timestamp("invite_token_expires_at"),
  createdById: varchar("created_by_id"),
  updatedById: varchar("updated_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Expense categories (tenant_id null = global template)
export const expenseCategories = pgTable("expense_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  parentId: varchar("parent_id"),
  displayOrder: integer("display_order").notNull().default(0),
  cashflowLabel: text("cashflow_label").notNull(),
  cashflowSection: text("cashflow_section").notNull().default("operating_outflow"),
  pnlSection: text("pnl_section").notNull().default("indirect"),
  drilldownMode: text("drilldown_mode").notNull().default("none"),
  misDisplayLabel: text("mis_display_label"),
  isActive: boolean("is_active").notNull().default(true),
  createdById: varchar("created_by_id"),
  updatedById: varchar("updated_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Petty cash funds
export const pettyCashFunds = pgTable("petty_cash_funds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id),
  costCenterId: varchar("cost_center_id").references(() => costCenters.id).notNull(),
  custodianId: varchar("custodian_id").references(() => users.id).notNull(),
  imprestAmount: integer("imprest_amount").notNull(),
  currentBalance: integer("current_balance").notNull().default(0),
  createdById: varchar("created_by_id").references(() => users.id),
  updatedById: varchar("updated_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Expenses
export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id),
  costCenterId: varchar("cost_center_id").references(() => costCenters.id),
  categoryId: varchar("category_id").references(() => expenseCategories.id).notNull(),
  amount: integer("amount").notNull(),
  expenseDate: timestamp("expense_date"),
  description: text("description"),
  particulars: text("particulars"),
  status: text("status").notNull().default("draft"),
  submittedById: varchar("submitted_by_id").references(() => users.id),
  submittedAt: timestamp("submitted_at"),
  submittedByContactPhone: varchar("submitted_by_contact_phone"),
  approvedById: varchar("approved_by_id").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  payoutMethod: text("payout_method"),
  payoutRef: text("payout_ref"),
  payoutAt: timestamp("payout_at"),
  source: text("source").notNull().default("finjoe"),
  attachments: jsonb("attachments").$type<string[]>().default([]),
  invoiceNumber: text("invoice_number"),
  invoiceDate: timestamp("invoice_date"),
  vendorName: text("vendor_name"),
  gstin: text("gstin"),
  taxType: text("tax_type"),
  voucherNumber: text("voucher_number"),
  bankTransactionId: varchar("bank_transaction_id"),
  recurringTemplateId: varchar("recurring_template_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Recurring expense templates (monthly rent, salaries, etc.)
export const recurringExpenseTemplates = pgTable("recurring_expense_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  costCenterId: varchar("cost_center_id").references(() => costCenters.id),
  categoryId: varchar("category_id").references(() => expenseCategories.id).notNull(),
  amount: integer("amount").notNull(),
  description: text("description"),
  vendorName: text("vendor_name"),
  gstin: text("gstin"),
  taxType: text("tax_type"),
  invoiceNumber: text("invoice_number"),
  voucherNumber: text("voucher_number"),
  frequency: text("frequency").notNull(),
  dayOfMonth: integer("day_of_month"),
  dayOfWeek: integer("day_of_week"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  isActive: boolean("is_active").notNull().default(true),
  nextRunDate: timestamp("next_run_date").notNull(),
  createdById: varchar("created_by_id").references(() => users.id),
  updatedById: varchar("updated_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// FinJoe: custom bytea type for media storage
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer) {
    return value;
  },
  fromDriver(value: unknown) {
    return value as Buffer;
  },
});

// FinJoe contacts (tenant_id, phone unique via migration)
export const finJoeContacts = pgTable("fin_joe_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id),
  phone: varchar("phone").notNull(),
  role: text("role").notNull(),
  studentId: varchar("student_id").references(() => users.id),
  name: text("name"),
  costCenterId: varchar("cost_center_id").references(() => costCenters.id),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// FinJoe conversations (contact identified by tenant_id + contact_phone)
export const finJoeConversations = pgTable("fin_joe_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id),
  contactPhone: varchar("contact_phone").notNull(),
  lastMessageAt: timestamp("last_message_at").notNull(),
  status: text("status").notNull().default("active"),
  context: jsonb("context").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// FinJoe messages
export const finJoeMessages = pgTable("fin_joe_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id")
    .notNull()
    .references(() => finJoeConversations.id, { onDelete: "cascade" }),
  direction: text("direction").notNull(),
  body: text("body"),
  messageSid: varchar("message_sid").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// FinJoe outbound send idempotency (prevents duplicate sends across retries/restarts)
export const finJoeOutboundIdempotency = pgTable("fin_joe_outbound_idempotency", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  conversationId: varchar("conversation_id")
    .notNull()
    .references(() => finJoeConversations.id, { onDelete: "cascade" }),
  inboundMessageSid: varchar("inbound_message_sid").notNull(),
  idempotencyKey: varchar("idempotency_key").notNull(),
  payloadHash: varchar("payload_hash").notNull(),
  status: text("status").notNull().default("in_flight"),
  providerMessageSid: varchar("provider_message_sid"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// FinJoe media
export const finJoeMedia = pgTable("fin_joe_media", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id")
    .notNull()
    .references(() => finJoeMessages.id, { onDelete: "cascade" }),
  contentType: varchar("content_type").notNull(),
  fileName: varchar("file_name"),
  data: bytea("data"),
  storagePath: varchar("storage_path"),
  expenseId: varchar("expense_id").references(() => expenses.id),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// FinJoe role change requests
export const finJoeRoleChangeRequests = pgTable("fin_joe_role_change_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id),
  contactPhone: varchar("contact_phone").notNull(),
  requestedRole: text("requested_role").notNull(),
  name: text("name"),
  costCenterId: varchar("cost_center_id").references(() => costCenters.id),
  studentId: varchar("student_id").references(() => users.id),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  approvedVia: text("approved_via"),
  rejectionReason: text("rejection_reason"),
});

// FinJoe tasks
export const finJoeTasks = pgTable("fin_joe_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id),
  conversationId: varchar("conversation_id")
    .notNull()
    .references(() => finJoeConversations.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  status: text("status").notNull(),
  expenseId: varchar("expense_id").references(() => expenses.id),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
  assignedToPhone: varchar("assigned_to_phone"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// FinJoe settings - Twilio template SIDs only (one per tenant)
export const finjoeSettings = pgTable("finjoe_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id),
  expenseApprovalTemplateSid: text("expense_approval_template_sid"),
  expenseApprovedTemplateSid: text("expense_approved_template_sid"),
  expenseRejectedTemplateSid: text("expense_rejected_template_sid"),
  reEngagementTemplateSid: text("re_engagement_template_sid"),
  notificationEmails: text("notification_emails"),
  resendFromEmail: text("resend_from_email"),
  smsFrom: text("sms_from"),
  costCenterLabel: text("cost_center_label"),
  costCenterType: text("cost_center_type"),
  requireConfirmationBeforePost: boolean("require_confirmation_before_post").default(false),
  requireAuditFieldsAboveAmount: integer("require_audit_fields_above_amount"),
  askOptionalFields: boolean("ask_optional_fields").default(false),
  fyStartMonth: integer("fy_start_month").notNull().default(4),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Income types (tenant-configurable)
export const incomeTypes = pgTable("income_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  slug: varchar("slug").notNull(),
  label: text("label").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
});

// Income categories (tenant-scoped)
export const incomeCategories = pgTable("income_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  incomeType: text("income_type").notNull().default("other"),
  misClassification: text("mis_classification").notNull().default("revenue"),
  revenueGroup: text("revenue_group"),
  misDisplayLabel: text("mis_display_label"),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdById: varchar("created_by_id"),
  updatedById: varchar("updated_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Recurring income templates (monthly fees, rent, etc.)
export const recurringIncomeTemplates = pgTable("recurring_income_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  costCenterId: varchar("cost_center_id").references(() => costCenters.id),
  categoryId: varchar("category_id").references(() => incomeCategories.id).notNull(),
  amount: integer("amount").notNull(),
  particulars: text("particulars"),
  incomeType: text("income_type").notNull().default("other"),
  frequency: text("frequency").notNull(),
  dayOfMonth: integer("day_of_month"),
  dayOfWeek: integer("day_of_week"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  isActive: boolean("is_active").notNull().default(true),
  nextRunDate: timestamp("next_run_date").notNull(),
  createdById: varchar("created_by_id").references(() => users.id),
  updatedById: varchar("updated_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Bank transactions (raw bank statement lines)
export const bankTransactions = pgTable("bank_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id),
  transactionDate: timestamp("transaction_date"),
  particulars: text("particulars"),
  amount: integer("amount").notNull(),
  type: text("type").notNull(),
  runningBalance: integer("running_balance"),
  rawCsvRow: jsonb("raw_csv_row").$type<Record<string, string>>(),
  importBatchId: varchar("import_batch_id"),
  reconciliationStatus: text("reconciliation_status").notNull().default("unmatched"),
  matchedExpenseId: varchar("matched_expense_id").references(() => expenses.id),
  matchedIncomeId: varchar("matched_income_id"),
  matchConfidence: text("match_confidence"),
  matchedAt: timestamp("matched_at"),
  matchedById: varchar("matched_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Income records
export const incomeRecords = pgTable("income_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id),
  costCenterId: varchar("cost_center_id").references(() => costCenters.id),
  categoryId: varchar("category_id").references(() => incomeCategories.id),
  amount: integer("amount").notNull(),
  incomeDate: timestamp("income_date"),
  particulars: text("particulars"),
  incomeType: text("income_type").notNull().default("other"),
  source: text("source").notNull().default("manual"),
  bankTransactionId: varchar("bank_transaction_id").references(() => bankTransactions.id),
  recurringTemplateId: varchar("recurring_template_id"),
  recordedById: varchar("recorded_by_id").references(() => users.id),
  razorpayPaymentId: varchar("razorpay_payment_id").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Razorpay (or future gateway) checkout orders — links verify → income_records (idempotent by razorpay_payment_id on income)
export const paymentOrders = pgTable("payment_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id),
  amountRupees: integer("amount_rupees").notNull(),
  currency: text("currency").notNull().default("INR"),
  razorpayOrderId: text("razorpay_order_id").notNull().unique(),
  status: text("status").notNull().default("created"),
  paymentType: text("payment_type"),
  incomeCategoryId: varchar("income_category_id")
    .notNull()
    .references(() => incomeCategories.id),
  costCenterId: varchar("cost_center_id").references(() => costCenters.id),
  incomeRecordId: varchar("income_record_id").references(() => incomeRecords.id),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Billing customers (tenant-scoped directory for invoicing)
export const billingCustomers = pgTable("billing_customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  gstin: text("gstin"),
  contactId: varchar("contact_id").references(() => finJoeContacts.id),
  userId: varchar("user_id").references(() => users.id),
  isActive: boolean("is_active").notNull().default(true),
  ext: jsonb("ext").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Invoices (tenant-scoped AR documents)
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id),
  customerId: varchar("customer_id")
    .notNull()
    .references(() => billingCustomers.id),
  invoiceNumber: text("invoice_number").notNull(),
  status: text("status").notNull().default("draft"),
  issueDate: timestamp("issue_date"),
  dueDate: timestamp("due_date"),
  subtotal: integer("subtotal").notNull().default(0),
  taxAmount: integer("tax_amount").notNull().default(0),
  total: integer("total").notNull().default(0),
  amountPaid: integer("amount_paid").notNull().default(0),
  currency: text("currency").notNull().default("INR"),
  notes: text("notes"),
  costCenterId: varchar("cost_center_id").references(() => costCenters.id),
  incomeCategoryId: varchar("income_category_id").references(() => incomeCategories.id),
  ext: jsonb("ext").$type<Record<string, unknown>>().default({}),
  issuedById: varchar("issued_by_id").references(() => users.id),
  issuedAt: timestamp("issued_at"),
  voidedById: varchar("voided_by_id").references(() => users.id),
  voidedAt: timestamp("voided_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Invoice line items
export const invoiceLines = pgTable("invoice_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitAmount: integer("unit_amount").notNull(),
  taxRate: integer("tax_rate").notNull().default(0),
  lineTotal: integer("line_total").notNull(),
  incomeCategoryId: varchar("income_category_id").references(() => incomeCategories.id),
  displayOrder: integer("display_order").notNull().default(0),
  ext: jsonb("ext").$type<Record<string, unknown>>().default({}),
});

// Payment allocations (link captures to invoices; derive "paid" from sum)
export const paymentAllocations = pgTable("payment_allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id),
  invoiceId: varchar("invoice_id")
    .notNull()
    .references(() => invoices.id),
  amount: integer("amount").notNull(),
  paymentOrderId: varchar("payment_order_id").references(() => paymentOrders.id),
  incomeRecordId: varchar("income_record_id").references(() => incomeRecords.id),
  provider: text("provider"),
  externalPaymentId: text("external_payment_id"),
  method: text("method"),
  reference: text("reference"),
  paymentDate: timestamp("payment_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Platform settings - single row, account-level defaults (super admin only)
export const platformSettings = pgTable("platform_settings", {
  id: varchar("id").primaryKey().default("default"),
  defaultNotificationEmails: text("default_notification_emails"),
  defaultResendFromEmail: text("default_resend_from_email"),
  defaultSmsFrom: text("default_sms_from"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Cron run history (admin-triggered and worker cron)
export const cronRuns = pgTable("cron_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobName: varchar("job_name").notNull(),
  status: varchar("status").notNull(),
  resultJson: jsonb("result_json"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  errorMessage: text("error_message"),
});

// Relations
export const tenantsRelations = relations(tenants, ({ many }) => ({
  costCenters: many(costCenters),
  campuses: many(costCenters),
  users: many(users),
  finJoeContacts: many(finJoeContacts),
  finjoeSettings: many(finjoeSettings),
  wabaProviders: many(tenantWabaProviders),
  incomeTypes: many(incomeTypes),
}));

export const tenantWabaProvidersRelations = relations(tenantWabaProviders, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantWabaProviders.tenantId], references: [tenants.id] }),
}));

export const costCentersRelations = relations(costCenters, ({ one, many }) => ({
  tenant: one(tenants, { fields: [costCenters.tenantId], references: [tenants.id] }),
  users: many(users),
  pettyCashFunds: many(pettyCashFunds),
  finJoeContacts: many(finJoeContacts),
  finJoeRoleChangeRequests: many(finJoeRoleChangeRequests),
}));

export const campusesRelations = costCentersRelations;

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
  costCenter: one(costCenters, { fields: [users.costCenterId], references: [costCenters.id] }),
  finJoeContacts: many(finJoeContacts),
}));

export const incomeTypesRelations = relations(incomeTypes, ({ one }) => ({
  tenant: one(tenants, { fields: [incomeTypes.tenantId], references: [tenants.id] }),
}));

export const expenseCategoriesRelations = relations(expenseCategories, ({ many }) => ({
  expenses: many(expenses),
}));

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  costCenter: one(costCenters, { fields: [expenses.costCenterId], references: [costCenters.id] }),
  category: one(expenseCategories, { fields: [expenses.categoryId], references: [expenseCategories.id] }),
  submittedBy: one(users, { fields: [expenses.submittedById], references: [users.id] }),
  approvedBy: one(users, { fields: [expenses.approvedById], references: [users.id] }),
  recurringTemplate: one(recurringExpenseTemplates, { fields: [expenses.recurringTemplateId], references: [recurringExpenseTemplates.id] }),
  finJoeTasks: many(finJoeTasks),
}));

export const recurringExpenseTemplatesRelations = relations(recurringExpenseTemplates, ({ one, many }) => ({
  tenant: one(tenants, { fields: [recurringExpenseTemplates.tenantId], references: [tenants.id] }),
  costCenter: one(costCenters, { fields: [recurringExpenseTemplates.costCenterId], references: [costCenters.id] }),
  category: one(expenseCategories, { fields: [recurringExpenseTemplates.categoryId], references: [expenseCategories.id] }),
  createdBy: one(users, { fields: [recurringExpenseTemplates.createdById], references: [users.id] }),
}));

export const finJoeContactsRelations = relations(finJoeContacts, ({ one, many }) => ({
  tenant: one(tenants, { fields: [finJoeContacts.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [finJoeContacts.studentId], references: [users.id] }),
  costCenter: one(costCenters, { fields: [finJoeContacts.costCenterId], references: [costCenters.id] }),
  conversations: many(finJoeConversations),
  roleChangeRequests: many(finJoeRoleChangeRequests),
}));

export const finJoeConversationsRelations = relations(finJoeConversations, ({ one, many }) => ({
  tenant: one(tenants, { fields: [finJoeConversations.tenantId], references: [tenants.id] }),
  messages: many(finJoeMessages),
  tasks: many(finJoeTasks),
}));

export const finJoeMessagesRelations = relations(finJoeMessages, ({ one, many }) => ({
  conversation: one(finJoeConversations, { fields: [finJoeMessages.conversationId], references: [finJoeConversations.id] }),
  media: many(finJoeMedia),
}));

export const finJoeOutboundIdempotencyRelations = relations(finJoeOutboundIdempotency, ({ one }) => ({
  conversation: one(finJoeConversations, { fields: [finJoeOutboundIdempotency.conversationId], references: [finJoeConversations.id] }),
  tenant: one(tenants, { fields: [finJoeOutboundIdempotency.tenantId], references: [tenants.id] }),
}));

export const finJoeMediaRelations = relations(finJoeMedia, ({ one }) => ({
  message: one(finJoeMessages, { fields: [finJoeMedia.messageId], references: [finJoeMessages.id] }),
}));

export const finJoeRoleChangeRequestsRelations = relations(finJoeRoleChangeRequests, ({ one }) => ({
  tenant: one(tenants, { fields: [finJoeRoleChangeRequests.tenantId], references: [tenants.id] }),
  costCenter: one(costCenters, { fields: [finJoeRoleChangeRequests.costCenterId], references: [costCenters.id] }),
  user: one(users, { fields: [finJoeRoleChangeRequests.studentId], references: [users.id] }),
  approvedByUser: one(users, { fields: [finJoeRoleChangeRequests.approvedBy], references: [users.id] }),
}));

export const finJoeTasksRelations = relations(finJoeTasks, ({ one }) => ({
  conversation: one(finJoeConversations, { fields: [finJoeTasks.conversationId], references: [finJoeConversations.id] }),
  expense: one(expenses, { fields: [finJoeTasks.expenseId], references: [expenses.id] }),
}));

export const bankTransactionsRelations = relations(bankTransactions, ({ one }) => ({
  tenant: one(tenants, { fields: [bankTransactions.tenantId], references: [tenants.id] }),
  matchedExpense: one(expenses, { fields: [bankTransactions.matchedExpenseId], references: [expenses.id] }),
}));

export const billingCustomersRelations = relations(billingCustomers, ({ one, many }) => ({
  tenant: one(tenants, { fields: [billingCustomers.tenantId], references: [tenants.id] }),
  invoices: many(invoices),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  tenant: one(tenants, { fields: [invoices.tenantId], references: [tenants.id] }),
  customer: one(billingCustomers, { fields: [invoices.customerId], references: [billingCustomers.id] }),
  costCenter: one(costCenters, { fields: [invoices.costCenterId], references: [costCenters.id] }),
  issuedBy: one(users, { fields: [invoices.issuedById], references: [users.id] }),
  lines: many(invoiceLines),
  allocations: many(paymentAllocations),
}));

export const invoiceLinesRelations = relations(invoiceLines, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceLines.invoiceId], references: [invoices.id] }),
  incomeCategory: one(incomeCategories, { fields: [invoiceLines.incomeCategoryId], references: [incomeCategories.id] }),
}));

export const paymentAllocationsRelations = relations(paymentAllocations, ({ one }) => ({
  tenant: one(tenants, { fields: [paymentAllocations.tenantId], references: [tenants.id] }),
  invoice: one(invoices, { fields: [paymentAllocations.invoiceId], references: [invoices.id] }),
  incomeRecord: one(incomeRecords, { fields: [paymentAllocations.incomeRecordId], references: [incomeRecords.id] }),
}));

// Types
export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;
export type TenantWabaProvider = typeof tenantWabaProviders.$inferSelect;
export type InsertTenantWabaProvider = typeof tenantWabaProviders.$inferInsert;
export type CostCenter = typeof costCenters.$inferSelect;
export type InsertCostCenter = typeof costCenters.$inferInsert;
export type Campus = CostCenter;
export type InsertCampus = InsertCostCenter;
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type InsertExpenseCategory = typeof expenseCategories.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = typeof expenses.$inferInsert;
export type RecurringExpenseTemplate = typeof recurringExpenseTemplates.$inferSelect;
export type InsertRecurringExpenseTemplate = typeof recurringExpenseTemplates.$inferInsert;

export type ExpenseWithDetails = Expense & {
  costCenterName?: string | null;
  categoryName?: string | null;
  campus?: { id: string; name: string | null; slug: string } | null;
  costCenter?: { id: string; name: string | null; slug: string } | null;
  category?: { id: string; name: string | null; slug: string } | null;
  submittedByName?: string | null;
  approvedByName?: string | null;
};
export type FinJoeContact = typeof finJoeContacts.$inferSelect;
export type InsertFinJoeContact = typeof finJoeContacts.$inferInsert;
export type FinJoeConversation = typeof finJoeConversations.$inferSelect;
export type InsertFinJoeConversation = typeof finJoeConversations.$inferSelect;
export type FinJoeMessage = typeof finJoeMessages.$inferSelect;
export type InsertFinJoeMessage = typeof finJoeMessages.$inferInsert;
export type FinJoeOutboundIdempotency = typeof finJoeOutboundIdempotency.$inferSelect;
export type InsertFinJoeOutboundIdempotency = typeof finJoeOutboundIdempotency.$inferInsert;
export type FinJoeMedia = typeof finJoeMedia.$inferSelect;
export type InsertFinJoeMedia = typeof finJoeMedia.$inferInsert;
export type FinJoeRoleChangeRequest = typeof finJoeRoleChangeRequests.$inferSelect;
export type InsertFinJoeRoleChangeRequest = typeof finJoeRoleChangeRequests.$inferInsert;
export type FinJoeTask = typeof finJoeTasks.$inferSelect;
export type InsertFinJoeTask = typeof finJoeTasks.$inferInsert;
export type FinjoeSettings = typeof finjoeSettings.$inferSelect;
export type InsertFinjoeSettings = typeof finjoeSettings.$inferInsert;
export type PlatformSettings = typeof platformSettings.$inferSelect;
export type InsertPlatformSettings = typeof platformSettings.$inferInsert;
export type IncomeType = typeof incomeTypes.$inferSelect;
export type InsertIncomeType = typeof incomeTypes.$inferInsert;
export type IncomeCategory = typeof incomeCategories.$inferSelect;
export type InsertIncomeCategory = typeof incomeCategories.$inferInsert;
export type IncomeRecord = typeof incomeRecords.$inferSelect;
export type InsertIncomeRecord = typeof incomeRecords.$inferInsert;

export type PaymentOrder = typeof paymentOrders.$inferSelect;
export type InsertPaymentOrder = typeof paymentOrders.$inferInsert;

export type BankTransaction = typeof bankTransactions.$inferSelect;
export type InsertBankTransaction = typeof bankTransactions.$inferInsert;

export type BillingCustomer = typeof billingCustomers.$inferSelect;
export type InsertBillingCustomer = typeof billingCustomers.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type InsertInvoiceLine = typeof invoiceLines.$inferInsert;
export type PaymentAllocation = typeof paymentAllocations.$inferSelect;
export type InsertPaymentAllocation = typeof paymentAllocations.$inferInsert;

export type InvoiceWithDetails = Invoice & {
  customerName?: string | null;
  costCenterName?: string | null;
  categoryName?: string | null;
  lines?: InvoiceLine[];
};

export type IncomeWithDetails = IncomeRecord & {
  costCenterName?: string | null;
  categoryName?: string | null;
  campusId?: string | null;
  campusName?: string | null;
  recordedByName?: string | null;
};

export type RegistrationWithDetails = Record<string, unknown>;
