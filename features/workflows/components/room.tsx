"use client"

import { ReactNode } from "react"
import * as Sentry from "@sentry/nextjs"
import {
  LiveblocksProvider,
  RoomProvider,
  ClientSideSuspense,
} from "@liveblocks/react/suspense"

export function Room({
  roomId,
  children,
}: {
  roomId: string
  children: ReactNode
}) {
  return (
    <LiveblocksProvider
      // ID tokens: the endpoint identifies the caller and the organization they
      // belong to, and the room's groupsAccesses decides what that admits.
      authEndpoint="/api/liveblocks/auth"
      // Liveblocks' own components read names and avatars through here rather
      // than from the token's userInfo, so without it cursors stay anonymous.
      resolveUsers={async ({ userIds }) => {
        const response = await fetch("/api/liveblocks/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The endpoint reads `userId`, following Clerk's own naming for an id
          // filter that takes a list.
          body: JSON.stringify({ userId: userIds }),
        })

        if (!response.ok) {
          // The failure mode this hides is a mild one — cursors and avatars
          // stay anonymous while the canvas itself works — which is precisely
          // why it needs saying: nothing about the page looks broken, so
          // without this the only report would be someone mentioning that
          // names stopped appearing.
          Sentry.logger.warn("Could not resolve room members", {
            room_id: roomId,
            status: response.status,
            requested_count: userIds.length,
          })

          // Liveblocks expands this into one undefined per requested id.
          return undefined
        }

        return response.json()
      }}
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
