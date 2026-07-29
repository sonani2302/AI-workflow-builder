"use client"

import { useEffect } from "react"
import { RotateCw, TriangleAlert } from "lucide-react"
import * as Sentry from "@sentry/nextjs"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // A server-side throw on this route was already reported by onRequestError,
  // and arrives here as a digest with the message stripped. What this adds is
  // the client half: an error thrown while the canvas is rendering, which
  // never reaches the server at all. Sentry de-duplicates the overlap by
  // event id, so the server case does not become two issues.
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDescription>
            {error.message || "This workflow could not be loaded."}
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
  )
}
