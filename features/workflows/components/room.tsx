"use client"

import { ReactNode } from "react"
import {
  LiveblocksProvider,
  RoomProvider,
  ClientSideSuspense,
} from "@liveblocks/react/suspense"

type UserInfo = Liveblocks["UserMeta"]["info"]

/**
 * Looks the ids up through Clerk, scoped to the caller's organization. Declared
 * outside the component so the identity stays stable across renders.
 */
async function resolveUsers({ userIds }: { userIds: readonly string[] }) {
  const response = await fetch("/api/liveblocks-users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userIds }),
  })

  if (!response.ok) {
    return userIds.map(() => undefined)
  }

  const users: (UserInfo | null)[] = await response.json()

  // JSON cannot carry undefined, so the endpoint sends null for anyone it could
  // not resolve. The array has to keep its length and order either way.
  return users.map((user) => user ?? undefined)
}

export function Room({
  roomId,
  children,
}: {
  roomId: string
  children: ReactNode
}) {
  return (
    <LiveblocksProvider
      // Not a public key: the endpoint checks that the caller's organization
      // owns this workflow before granting the room.
      authEndpoint="/api/liveblocks-auth"
      // Liveblocks' own components read names and avatars through here rather
      // than from the token's userInfo, so without it cursors stay anonymous.
      resolveUsers={resolveUsers}
      // 16ms is the minimum, so presence and storage run at 60FPS instead of
      // the default 10.
      throttle={16}
    >
      <RoomProvider id={roomId}>
        <ClientSideSuspense fallback={<div>Loading…</div>}>
          {children}
        </ClientSideSuspense>
      </RoomProvider>
    </LiveblocksProvider>
  )
}
