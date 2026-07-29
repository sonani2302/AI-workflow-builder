import { act } from "@/features/workflows/nodes/act"
import { agent } from "@/features/workflows/nodes/agent"
import { extract } from "@/features/workflows/nodes/extract"
import type { NodeExecutor } from "@/features/workflows/nodes/node-contract"
import { observe } from "@/features/workflows/nodes/observe"
import type {
  ActionNodeType,
  NodeType,
} from "@/features/workflows/nodes/node-registry"
import { openUrl } from "@/features/workflows/nodes/open-url"
import { sendEmail } from "@/features/workflows/nodes/send-email"

/**
 * Node type to the function that runs it.
 *
 * The `satisfies` is the point of the file: keyed by ActionNodeType, so adding
 * an action to the node registry without writing its executor is a type error
 * here rather than a step that silently does nothing at runtime.
 */
export const nodeExecutors = {
  "open-url": openUrl,
  act,
  extract,
  observe,
  agent,
  "send-email": sendEmail,
} satisfies Record<ActionNodeType, NodeExecutor>

/**
 * The executor for a node type, or null for one that has none — the trigger,
 * which marks where a run starts rather than doing work of its own. Returning
 * null rather than throwing keeps "nothing to run" a normal answer, since the
 * runner walks every node in the graph including the one that begins it.
 */
export function executorFor(type: NodeType): NodeExecutor | null {
  return type in nodeExecutors ? nodeExecutors[type as ActionNodeType] : null
}
