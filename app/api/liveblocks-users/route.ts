import { auth, clerkClient } from "@clerk/nextjs/server"

// Clerk caps both the id and membership filters at 100 entries.
const MAX_USER_IDS = 100

/**
 * Turns Liveblocks user ids into the display info its components render, so
 * cursors and avatars carry real names instead of being anonymous.
 */
export async function POST(request: Request) {
  const { userId, orgId } = await auth()

  if (!userId || !orgId) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { userIds } = await request.json()

  if (
    !Array.isArray(userIds) ||
    userIds.length === 0 ||
    userIds.length > MAX_USER_IDS ||
    userIds.some((id) => typeof id !== "string")
  ) {
    return new Response("Bad Request", { status: 400 })
  }

  const client = await clerkClient()

  // Filtering by organization as well as by id is what stops this being a
  // lookup table for the whole Clerk instance: a caller can only ever resolve
  // people they already share an organization with.
  const { data } = await client.organizations.getOrganizationMembershipList({
    organizationId: orgId,
    userId: userIds,
    limit: userIds.length,
  })

  const membersById = new Map(
    data
      .map((membership) => membership.publicUserData)
      .filter((user) => user != null)
      .map((user) => [user.userId, user])
  )

  // Liveblocks needs the same length and order as it asked for, so an unknown
  // id becomes a hole rather than being dropped.
  const users = userIds.map((id) => {
    const user = membersById.get(id)

    if (!user) {
      return null
    }

    const name = [user.firstName, user.lastName].filter(Boolean).join(" ")

    return {
      // identifier is the email or username, and is the better fallback than
      // showing nothing when a member has not set a name.
      name: name || user.identifier,
      avatar: user.imageUrl,
    }
  })

  return Response.json(users)
}
