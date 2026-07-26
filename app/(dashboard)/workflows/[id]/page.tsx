import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"

import { getLiveblocks } from "@/lib/liveblocks"
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

  // First level: the database decides whether this page renders at all.
  const workflow = await getWorkflow(orgId, id)

  if (!workflow) {
    notFound()
  }

  // Second level: the room decides who it admits. The ID token from
  // /api/liveblocks/auth claims the caller's orgId as a group and carries no
  // permissions of its own, so this is what actually scopes the room, and it
  // holds even for a client that never loads this page.
  await getLiveblocks().getOrCreateRoom(id, {
    // Private by default, then opened to one organization. Without the empty
    // default the room would admit every authenticated user.
    defaultAccesses: [],
    groupsAccesses: { [orgId]: ["room:write"] },
    // Compartmentalizes the room in the Liveblocks dashboard and API, where it
    // would otherwise land in the "default" organization alongside every other
    // tenant's rooms. Also lets getRooms be filtered by organization.
    organizationId: orgId,
  })

  return (
    <Room roomId={id}>
      <WorkflowShell workflowId={id} />
    </Room>
  )
}
