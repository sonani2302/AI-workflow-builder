import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

// Type-only, so it erases before drizzle-kit ever loads this file — the graph
// shape belongs with the node types that define it, not with the column.
import type { WorkflowGraph } from "@/features/workflows/nodes/node-registry"

export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Clerk organization the workflow belongs to.
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  // Null until the canvas has been saved for the first time. $type is a
  // compile-time claim about what the column holds, not a runtime check, so
  // anything written here still has to be the shape it says.
  graph: jsonb("graph").$type<WorkflowGraph>(),
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
