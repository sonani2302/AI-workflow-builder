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
      publicApiKey={process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY!}
    >
      <RoomProvider id={roomId}>
        <ClientSideSuspense fallback={<div>Loading…</div>}>
          {children}
        </ClientSideSuspense>
      </RoomProvider>
    </LiveblocksProvider>
  )
}
