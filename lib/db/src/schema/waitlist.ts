import {
  pgEnum,
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const waitlistStatusEnum = pgEnum("waitlist_status", [
  "pending",
  "approved",
  "rejected",
]);

export const onboardingStatusEnum = pgEnum("onboarding_status", [
  "not_contacted",
  "contacted",
  "onboarding_scheduled",
  "testing_v1",
  "feedback_received",
  "completed",
]);

export const waitlistApplications = pgTable(
  "waitlist_applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),

    role: varchar("role", { length: 80 }).notNull(),
    reconciliationMethod: text("reconciliation_method").notNull(),
    monthlyInvoiceVolume: varchar("monthly_invoice_volume", {
      length: 80,
    }).notNull(),

    status: waitlistStatusEnum("status").default("pending").notNull(),

    onboardingStatus: onboardingStatusEnum("onboarding_status")
      .default("not_contacted")
      .notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("waitlist_applications_email_unique").on(table.email),
  ],
);

export type WaitlistApplication =
  typeof waitlistApplications.$inferSelect;

export type NewWaitlistApplication =
  typeof waitlistApplications.$inferInsert;
