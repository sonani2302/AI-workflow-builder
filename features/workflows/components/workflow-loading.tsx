import { Spinner } from "@/components/ui/spinner"

/**
 * The wait before a workflow canvas can be shown.
 *
 * Opening one is two waits rather than one, on opposite sides of the page being
 * delivered: the server gathers what the page needs — the workflow, its room,
 * a token to read its runs — and then the browser connects to that room and
 * pulls down the canvas itself. Neither can be skipped and neither can be
 * folded into the other.
 *
 * So this is what both of them show. One component rather than a fallback
 * written at each boundary, because the two used to look nothing alike — a
 * centred spinner, then bare unstyled text — and what is really one continuous
 * wait read as two separate loading screens. Sharing it means the spinner stays
 * exactly where it is across the handover, and only the line underneath
 * changes.
 *
 * No client directive: Spinner is a plain component, so this renders on the
 * server for the route's own loading file as happily as it does inside the
 * room's Suspense boundary.
 */
export function WorkflowLoading({
  label,
}: {
  /**
   * What is being waited on, in a few words.
   *
   * Required rather than defaulted, so a new boundary has to say which of the
   * waits it is — a default would quietly make every one of them look like the
   * first.
   */
  label: string
}) {
  return (
    // The same box either way, which is the point: flex-1 fills the layout's
    // content slot, and both boundaries render into that same slot.
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
      <Spinner className="size-6 text-muted-foreground" />

      {/* aria-live so the change of wait is announced rather than silently
          swapped — to a screen reader the spinner alone says nothing, and this
          line is the only thing that reports progress. */}
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {label}
      </p>
    </div>
  )
}
