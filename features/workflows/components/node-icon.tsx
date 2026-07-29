"use client"

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
  type: NodeType
  /** Swaps the icon for a spinner, for a step that is working right now. */
  running?: boolean
  className?: string
}) {
  const def = nodeRegistry[type]
  const Icon = def.icon

  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md",
        def.accent,
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
