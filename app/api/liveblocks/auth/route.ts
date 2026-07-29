import { auth, currentUser } from "@clerk/nextjs/server"
import * as Sentry from "@sentry/nextjs"

import { getLiveblocks } from "@/lib/liveblocks"

/**
 * ID token authentication for Liveblocks.
 *
 * An ID token states who the caller is and which groups they belong to; it
 * carries no room permissions of its own. Access is decided by the room, so a
 * room must grant `groupsAccesses[orgId]` for that organization's members to
 * join, and a room with no permissions stays private to everyone.
 *
 * The request body is deliberately ignored. Unlike access tokens, this endpoint
 * never names a room, so there is nothing here for a caller to influence.
 */
export async function POST() {
  const { userId, orgId } = await auth()

  // Clerk is the source of truth for identity. Refusing without an active
  // organization matters because orgId is the only group being claimed below,
  // and a token with no group could never be granted a room.
  if (!userId || !orgId) {
    return new Response("Unauthorized", { status: 401 })
  }

  Sentry.getIsolationScope().setAttributes({
    route: "liveblocks-auth",
    org_id: orgId,
  })

  const user = await currentUser()

  const { status, body } = await getLiveblocks().identifyUser(
    {
      userId,
      // The Clerk organization is the group. Scoping happens on the room, which
      // admits this group rather than individual users, so membership changes in
      // Clerk take effect without touching room permissions.
      groupIds: [orgId],
      // Confines the token to one organization's resources, even if this user
      // belongs to others. A user who switches organization re-authenticates and
      // gets a token that cannot reach the rooms of the one they left.
      organizationId: orgId,
    },
    {
      // Feeds `other.info` in the browser. Liveblocks' own components read names
      // through resolveUsers instead, so this is for custom UI.
      userInfo: {
        name: user?.fullName ?? "Anonymous",
        avatar: user?.imageUrl,
      },
    }
  )

  // Liveblocks answers with a status rather than throwing, so a refusal here
  // would otherwise be silent: the canvas would simply never connect, with
  // nothing on the server saying why. Only the failures are logged — a success
  // happens on every page open and every reconnect.
  if (status >= 400) {
    Sentry.logger.error("Liveblocks refused to identify user", {
      liveblocks_status: status,
    })
  }

  return new Response(body, { status })
}
