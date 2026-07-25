import "server-only"

import { desc, eq } from "drizzle-orm"

import { db, workflows } from "@/lib/db"

/** Workflows for one Clerk organization, newest first. */
export function listWorkflows(orgId: string) {
  return db
    .select()
    .from(workflows)
    .where(eq(workflows.orgId, orgId))
    .orderBy(desc(workflows.createdAt))
}
