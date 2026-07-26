import { auth, clerkClient } from "@clerk/nextjs/server"

// Clerk caps both the user id and organization membership filters at 100.
const MAX_USER_IDS = 100

/**
 * Resolves user ids to the display info Liveblocks renders on cursors and
 * avatars.
 *
 * Body: `{ userId: string[] }`. Responds with an array of
 * `{ name, avatar } | null` of the same length and in the same order, because
 * Liveblocks matches its request up positionally: dropping an entry would move
 * a name onto the wrong person.
 */
export async function POST(request: Request) {
  // Named apart from the ids being resolved. Only the session is read here, not
  // currentUser(), which would spend a Clerk API call to learn who is asking.
  const { userId: callerId, orgId } = await auth()

  if (!callerId || !orgId) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { userId } = await request.json()

  if (
    !Array.isArray(userId) ||
    userId.length === 0 ||
    userId.length > MAX_USER_IDS ||
    userId.some((id) => typeof id !== "string")
  ) {
    return new Response("Bad Request", { status: 400 })
  }

  const client = await clerkClient()

  // Filtering by organization as well as by id is what stops this being a
  // lookup table for the whole Clerk instance. There is no organization filter
  // on the users endpoint, so resolving ids directly would let any signed-in
  // caller read names and avatars out of organizations they do not belong to.
  const { data } = await client.organizations.getOrganizationMembershipList({
    organizationId: orgId,
    userId,
    limit: userId.length,
  })

  const membersById = new Map(
    data
      .map((membership) => membership.publicUserData)
      .filter((user) => user != null)
      .map((user) => [user.userId, user])
  )

  const users = userId.map((id) => {
    const user = membersById.get(id)

    // Unknown, or not a member of this organization. Either way the caller
    // learns nothing beyond "no info", and the slot keeps its place.
    if (!user) {
      return null
    }

    const name = [user.firstName, user.lastName].filter(Boolean).join(" ")

    return {
      // identifier is the email or username, a better fallback than an empty
      // label for a member who never set a name.
      name: name || user.identifier,
      avatar: user.imageUrl,
    }
  })

  return Response.json(users)
}
