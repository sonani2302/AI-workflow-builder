"use client"

import { CircleDashed } from "lucide-react"

import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import {
  nodeRegistry,
  type NodeType,
} from "@/features/workflows/nodes/node-registry"

/**
 * The accent-colored icon chip, mirroring the node on the canvas.
 *
 * Its own module rather than living in the sidebar that first needed it: the
 * console names a step the same way the sidebar names a node, and reaching into
 * the sidebar for it would have the console importing that whole file — its
 * dialogs, its server actions — to draw a coloured square.
 */
export function NodeIcon({
  type,
  running,
  className,
}: {
  /**
   * Null for a step whose type is not known — see the console's read of a run's
   * steps. The canvas always has a real type, and passes one.
   */
  type: NodeType | null
  /** Swaps the icon for a spinner, for a step that is working right now. */
  running?: boolean
  className?: string
}) {
  // Looked up rather than indexed blind, because a caller can hold a type this
  // build has never heard of: a run recorded months ago named the node types of
  // the graph it walked, and the registry has moved on since. Reading .icon off
  // the miss is what used to take the whole console down with it.
  const def = type ? nodeRegistry[type] : undefined

  // Deliberately colourless. An accent is how this chip says which node it is,
  // so guessing one for a step nobody can identify would be the one wrong
  // answer; a dashed outline says "a step, and that is all we know".
  const Icon = def?.icon ?? CircleDashed

  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md",
        def?.accent ?? "bg-muted text-muted-foreground",
        className
      )}
    >
      {/* In the chip rather than beside it, so a step starting swaps what is
          already there instead of shifting the title along — and the accent
          colour stays, which is what says which node is working. */}
      {running ? (
        <Spinner className="size-3.5" />
      ) : (
        <Icon className="size-3.5" />
      )}
    </span>
  )
}
