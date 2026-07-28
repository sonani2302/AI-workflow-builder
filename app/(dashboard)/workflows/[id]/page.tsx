import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
// Aliased because Clerk's auth is already the auth on this page, and the two
// have nothing to do with each other.
import { auth as triggerAuth } from "@trigger.dev/sdk"
import { ReactFlowProvider } from "@xyflow/react"

import { getLiveblocks } from "@/lib/liveblocks"
import { getWorkflow } from "@/features/workflows/data"
import { Room } from "@/features/workflows/components/room"
import { WorkflowRunsProvider } from "@/features/workflows/components/workflow-runs-provider"
import { WorkflowShell } from "@/features/workflows/components/workflow-shell"
import { workflowRunsTag } from "@/features/workflows/lib/run-tag"

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

  // Minted only once the checks above have passed, so the token is never handed
  // to a browser that was not going to be shown this workflow anyway.
  //
  // Read on one tag and nothing else: it reaches every run of this workflow,
  // including ones already going when the page opened, and no run of any other.
  // An hour outlasts the sitting a canvas gets while staying short enough that a
  // token read off the page is not worth much later.
  const runsToken = await triggerAuth.createPublicToken({
    scopes: { read: { tags: [workflowRunsTag(id)] } },
    expirationTime: "1h",
    // The payload of these runs is the entire graph, and it would be sent again
    // on every update of every run for a canvas that only reads their steps.
    // The tag subscription takes no skipColumns of its own, so the token is the
    // one place this can be said.
    realtime: { skipColumns: ["payload"] },
  })

  return (
    <Room roomId={id}>
      {/* Sits above both the canvas and the sidebar, so the palette out in the
          sidebar writes to the same React Flow store the canvas renders. */}
      <ReactFlowProvider>
        <WorkflowRunsProvider workflowId={id} accessToken={runsToken}>
          <WorkflowShell workflowId={id} />
        </WorkflowRunsProvider>
      </ReactFlowProvider>
    </Room>
  )
}
