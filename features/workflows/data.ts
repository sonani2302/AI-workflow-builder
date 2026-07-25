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

/** Create an empty workflow for one Clerk organization. */
export async function createWorkflow(orgId: string, name: string) {
  const [workflow] = await db
    .insert(workflows)
    .values({ orgId, name })
    .returning()

  return workflow
}
