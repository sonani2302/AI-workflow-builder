import { auth, currentUser } from "@clerk/nextjs/server"

import { getLiveblocks } from "@/lib/liveblocks"
import { getWorkflow } from "@/features/workflows/data"

// A room id is a workflow id, and that column is a uuid, so a malformed value
// would make Postgres throw instead of simply missing.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Authorizes a browser to join one Liveblocks room. The room is only granted if
 * the caller's organization owns the workflow behind it, so a link to another
 * organization's workflow is refused here rather than only being hidden in the
 * UI.
 */
export async function POST(request: Request) {
  const { userId, orgId } = await auth()

  if (!userId || !orgId) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { room } = await request.json()

  if (typeof room !== "string" || !UUID_PATTERN.test(room)) {
    return new Response("Bad Request", { status: 400 })
  }

  const workflow = await getWorkflow(orgId, room)

  if (!workflow) {
    return new Response("Forbidden", { status: 403 })
  }

  const user = await currentUser()

  const session = getLiveblocks().prepareSession(userId, {
    organizationId: orgId,
    // Feeds `other.info` in the browser, which is what puts a name on a cursor.
    userInfo: {
      name: user?.fullName ?? "Anonymous",
      avatar: user?.imageUrl,
    },
  })

  // Exactly this room, nothing else. No wildcard, so a token minted for one
  // workflow cannot be replayed against another.
  session.allow(room, ["*:write"])

  const { status, body } = await session.authorize()

  return new Response(body, { status })
}
