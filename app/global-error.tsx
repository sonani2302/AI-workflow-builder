"use client"

import { useEffect } from "react"
import { RotateCw, TriangleAlert } from "lucide-react"
import * as Sentry from "@sentry/nextjs"

import "./globals.css"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

/**
 * The last boundary: a throw in the root layout, or a render error no nested
 * error.tsx caught. It replaces the root layout rather than rendering inside
 * it, which is why it carries its own html, body and stylesheet — the layout
 * that normally provides those is the thing that may have just failed.
 *
 * The capture is explicit because React handles these on the client, where
 * onRequestError never runs. Reset is offered but the page is deliberately
 * plain: no providers are mounted here, so nothing that needs Clerk, the
 * theme or a room can be used.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en" suppressHydrationWarning className="antialiased">
      <body>
        <div className="flex min-h-svh flex-col items-center justify-center p-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TriangleAlert />
              </EmptyMedia>
              <EmptyTitle>Something went wrong</EmptyTitle>
              <EmptyDescription>
                The page could not be loaded. This has been reported.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={reset}>
                <RotateCw />
                Try again
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      </body>
    </html>
  )
}
