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

// Campuses - minimal for FinJoe
export const campuses = pgTable("campuses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Users - FinJoe's equivalent of students (admin, finance, etc.)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("admin"),
  campusId: varchar("campus_id").references(() => campuses.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Expense categories
export const expenseCategories = pgTable("expense_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  parentId: varchar("parent_id"),
  displayOrder: integer("display_order").notNull().default(0),
  cashflowLabel: text("cashflow_label").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Petty cash funds
export const pettyCashFunds = pgTable("petty_cash_funds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campusId: varchar("campus_id").references(() => campuses.id).notNull(),
  custodianId: varchar("custodian_id").references(() => users.id).notNull(),
  imprestAmount: integer("imprest_amount").notNull(),
  currentBalance: integer("current_balance").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Expenses
export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campusId: varchar("campus_id").references(() => campuses.id),
  categoryId: varchar("category_id").references(() => expenseCategories.id).notNull(),
  amount: integer("amount").notNull(),
  expenseDate: timestamp("expense_date").notNull(),
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

// FinJoe contacts (studentId references users - kept for API compatibility)
export const finJoeContacts = pgTable("fin_joe_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone: varchar("phone").notNull().unique(),
  role: text("role").notNull(),
  studentId: varchar("student_id").references(() => users.id),
  name: text("name"),
  campusId: varchar("campus_id").references(() => campuses.id),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// FinJoe conversations
export const finJoeConversations = pgTable("fin_joe_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactPhone: varchar("contact_phone").notNull().references(() => finJoeContacts.phone),
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

// FinJoe media
export const finJoeMedia = pgTable("fin_joe_media", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id")
    .notNull()
    .references(() => finJoeMessages.id, { onDelete: "cascade" }),
  contentType: varchar("content_type").notNull(),
  fileName: varchar("file_name"),
  data: bytea("data").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// FinJoe role change requests
export const finJoeRoleChangeRequests = pgTable("fin_joe_role_change_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactPhone: varchar("contact_phone").notNull().references(() => finJoeContacts.phone),
  requestedRole: text("requested_role").notNull(),
  name: text("name"),
  campusId: varchar("campus_id").references(() => campuses.id),
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

// FinJoe settings - Twilio template SIDs only
export const finjoeSettings = pgTable("finjoe_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  expenseApprovalTemplateSid: text("expense_approval_template_sid"),
  expenseApprovedTemplateSid: text("expense_approved_template_sid"),
  expenseRejectedTemplateSid: text("expense_rejected_template_sid"),
  reEngagementTemplateSid: text("re_engagement_template_sid"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const campusesRelations = relations(campuses, ({ many }) => ({
  users: many(users),
  expenseCategories: many(expenseCategories),
  pettyCashFunds: many(pettyCashFunds),
  finJoeContacts: many(finJoeContacts),
  finJoeRoleChangeRequests: many(finJoeRoleChangeRequests),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  campus: one(campuses, { fields: [users.campusId], references: [campuses.id] }),
  finJoeContacts: many(finJoeContacts),
}));

export const expenseCategoriesRelations = relations(expenseCategories, ({ many }) => ({
  expenses: many(expenses),
}));

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  campus: one(campuses, { fields: [expenses.campusId], references: [campuses.id] }),
  category: one(expenseCategories, { fields: [expenses.categoryId], references: [expenseCategories.id] }),
  submittedBy: one(users, { fields: [expenses.submittedById], references: [users.id] }),
  approvedBy: one(users, { fields: [expenses.approvedById], references: [users.id] }),
  finJoeTasks: many(finJoeTasks),
}));

export const finJoeContactsRelations = relations(finJoeContacts, ({ one, many }) => ({
  user: one(users, { fields: [finJoeContacts.studentId], references: [users.id] }),
  campus: one(campuses, { fields: [finJoeContacts.campusId], references: [campuses.id] }),
  conversations: many(finJoeConversations),
  roleChangeRequests: many(finJoeRoleChangeRequests),
}));

export const finJoeConversationsRelations = relations(finJoeConversations, ({ one, many }) => ({
  contact: one(finJoeContacts, { fields: [finJoeConversations.contactPhone], references: [finJoeContacts.phone] }),
  messages: many(finJoeMessages),
  tasks: many(finJoeTasks),
}));

export const finJoeMessagesRelations = relations(finJoeMessages, ({ one, many }) => ({
  conversation: one(finJoeConversations, { fields: [finJoeMessages.conversationId], references: [finJoeConversations.id] }),
  media: many(finJoeMedia),
}));

export const finJoeMediaRelations = relations(finJoeMedia, ({ one }) => ({
  message: one(finJoeMessages, { fields: [finJoeMedia.messageId], references: [finJoeMessages.id] }),
}));

export const finJoeRoleChangeRequestsRelations = relations(finJoeRoleChangeRequests, ({ one }) => ({
  contact: one(finJoeContacts, { fields: [finJoeRoleChangeRequests.contactPhone], references: [finJoeContacts.phone] }),
  campus: one(campuses, { fields: [finJoeRoleChangeRequests.campusId], references: [campuses.id] }),
  user: one(users, { fields: [finJoeRoleChangeRequests.studentId], references: [users.id] }),
  approvedByUser: one(users, { fields: [finJoeRoleChangeRequests.approvedBy], references: [users.id] }),
}));

export const finJoeTasksRelations = relations(finJoeTasks, ({ one }) => ({
  conversation: one(finJoeConversations, { fields: [finJoeTasks.conversationId], references: [finJoeConversations.id] }),
  expense: one(expenses, { fields: [finJoeTasks.expenseId], references: [expenses.id] }),
}));

// Types
export type Campus = typeof campuses.$inferSelect;
export type InsertCampus = typeof campuses.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type InsertExpenseCategory = typeof expenseCategories.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = typeof expenses.$inferInsert;
export type FinJoeContact = typeof finJoeContacts.$inferSelect;
export type InsertFinJoeContact = typeof finJoeContacts.$inferInsert;
export type FinJoeConversation = typeof finJoeConversations.$inferSelect;
export type InsertFinJoeConversation = typeof finJoeConversations.$inferSelect;
export type FinJoeMessage = typeof finJoeMessages.$inferSelect;
export type InsertFinJoeMessage = typeof finJoeMessages.$inferInsert;
export type FinJoeMedia = typeof finJoeMedia.$inferSelect;
export type InsertFinJoeMedia = typeof finJoeMedia.$inferInsert;
export type FinJoeRoleChangeRequest = typeof finJoeRoleChangeRequests.$inferSelect;
export type InsertFinJoeRoleChangeRequest = typeof finJoeRoleChangeRequests.$inferInsert;
export type FinJoeTask = typeof finJoeTasks.$inferSelect;
export type InsertFinJoeTask = typeof finJoeTasks.$inferInsert;
export type FinjoeSettings = typeof finjoeSettings.$inferSelect;
export type InsertFinjoeSettings = typeof finjoeSettings.$inferInsert;
