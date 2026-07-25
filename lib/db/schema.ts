import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Clerk organization the workflow belongs to.
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  // Null until the canvas has been saved for the first time.
  graph: jsonb("graph"),
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
