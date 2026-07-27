import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"

import { cn } from "@/lib/utils"
import {
  nodeRegistry,
  type StepNodeType,
} from "@/features/workflows/nodes/node-registry"

function StepNodeComponent({ data, selected }: NodeProps<StepNodeType>) {
  const { type, kind, title, values } = data
  const def = nodeRegistry[type]
  const Icon = def.icon

  // A trigger starts the flow and takes no input, so it has no target handle.
  const hasTarget = kind !== "trigger"

  return (
    <div
      className={cn(
        "min-w-50 max-w-80 rounded-(--radius) border-2 border-border bg-card text-card-foreground",
        selected && "ring-2 ring-ring ring-offset-2 ring-offset-background"
      )}
    >
      {hasTarget && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ transform: "translate(-100%, -50%)" }}
          className="h-3.5! w-1.5! min-w-0! rounded-l-xs! rounded-r-none! border-0! bg-border!"
        />
      )}

      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md",
            def.accent
          )}
        >
          <Icon className="size-4" />
        </div>
        <span className="text-sm font-semibold">{title}</span>
      </div>

      {/* Every field the node type declares, so the canvas shows what a step
          will actually do without going through the editor. Driven by the
          registry rather than by the keys present on values, so a field added
          to a definition shows up on nodes saved before it existed. */}
      {def.fields.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border px-3 py-2">
          {def.fields.map((field) => {
            const value = values[field.key]

            return (
              <div
                key={field.key}
                className="flex items-baseline gap-2 text-xs"
              >
                <span className="shrink-0 text-muted-foreground">
                  {field.label}
                </span>
                {/* A long value truncates rather than widening the node past
                    max-w-80; title puts the whole of it in reach on hover. */}
                <span
                  title={value || undefined}
                  className={cn(
                    "min-w-0 flex-1 truncate text-right",
                    !value && "text-muted-foreground/60"
                  )}
                >
                  {value || "—"}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{ transform: "translate(100%, -50%)" }}
        className="h-3.5! w-1.5! min-w-0! rounded-l-none! rounded-r-xs! border-0! bg-border!"
      />
    </div>
  )
}

export const StepNode = memo(StepNodeComponent)
