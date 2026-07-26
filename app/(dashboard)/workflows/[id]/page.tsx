import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"

import { getWorkflow } from "@/features/workflows/data"
import { Room } from "@/features/workflows/components/room"
import { WorkflowShell } from "@/features/workflows/components/workflow-shell"

// A workflow id is a uuid, so anything else can miss without asking Postgres,
// which would throw on a malformed value rather than return no rows.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // The layout already guarantees a session and an active organization.
  const { orgId } = await auth()

  // Not found rather than forbidden: someone guessing at ids should not learn
  // whether a workflow exists in an organization they are not part of.
  if (!orgId || !UUID_PATTERN.test(id)) {
    notFound()
  }

  const workflow = await getWorkflow(orgId, id)

  if (!workflow) {
    notFound()
  }

  return (
    <Room roomId={id}>
      <WorkflowShell workflowId={id} />
    </Room>
  )
}
