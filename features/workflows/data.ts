import "server-only"

import { and, desc, eq } from "drizzle-orm"

import { db, workflows, type Workflow } from "@/lib/db"

/** Workflows for one Clerk organization, newest first. */
export function listWorkflows(orgId: string) {
  return db
    .select()
    .from(workflows)
    .where(eq(workflows.orgId, orgId))
    .orderBy(desc(workflows.createdAt))
}

/**
 * One workflow, matched on both id and organization so a caller cannot read
 * another org's row by guessing its id. Undefined when there is no match.
 */
export async function getWorkflow(
  orgId: string,
  id: string
): Promise<Workflow | undefined> {
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.orgId, orgId), eq(workflows.id, id)))
    .limit(1)

  return workflow
}

/**
 * Delete one workflow, matched on both id and organization so a caller cannot
 * remove another org's row by guessing its id. Returns the row that went, or
 * undefined when nothing matched — which is how the caller tells "deleted"
 * apart from "was never yours".
 */
export async function deleteWorkflow(
  orgId: string,
  id: string
): Promise<Workflow | undefined> {
  const [workflow] = await db
    .delete(workflows)
    .where(and(eq(workflows.orgId, orgId), eq(workflows.id, id)))
    .returning()

  return workflow
}

/** Create an empty workflow for one Clerk organization. */
export async function createWorkflow(orgId: string, name: string) {
  const [workflow] = await db
    .insert(workflows)
    .values({ orgId, name })
    .returning()

  return workflow
}
