"use client"

import { ReactNode } from "react"
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
      // Not a public key: the endpoint checks that the caller's organization
      // owns this workflow before granting the room.
      authEndpoint="/api/liveblocks-auth"
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
