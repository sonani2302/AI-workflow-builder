import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // Clerk identifiers; a workflow belongs to an organization and is created by a user.
  organizationId: text("organization_id").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export type Workflow = typeof workflows.$inferSelect
export type NewWorkflow = typeof workflows.$inferInsert
