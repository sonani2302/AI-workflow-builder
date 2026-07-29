import {
  NodeInputError,
  requirePage,
  type NodeRunContext,
} from "@/features/workflows/nodes/node-contract"

// The executor behind the "observe" registry entry. Act does a thing and
// extract reads one; this only points. It asks the page which of its elements
// answer to a description and hands back what it found, having touched nothing.

/** One element the page offered up, as somewhere a later step could aim. */
export type ObserveMatch = {
  /** How to reach the element, which is what makes a match worth returning. */
  selector: string
  /** What Stagehand took the element to be — the label a person would use. */
  description: string
}

export type ObserveResult = {
  matches: ObserveMatch[]
  /** Kept alongside the list because "did it find any" is the usual question. */
  count: number
}

/**
 * Finds the actionable elements on the current page that match the instruction.
 *
 * The reason to have this next to act, which finds its own element and then
 * clicks it: looking without acting is what lets a workflow check before it
 * commits — whether the button is on the page at all, how many results came
 * back, which of them to name — and none of that should require the click.
 */
export async function observe(
  context: NodeRunContext,
  values: Record<string, string>
): Promise<ObserveResult> {
  const instruction = values.instruction?.trim() ?? ""

  if (!instruction) {
    throw new NodeInputError("Observe needs to be told what to look for.")
  }

  // Looking needs something to look at.
  requirePage(context, "Observe")

  const found = await context.stagehand.observe(instruction)

  // Narrowed to the selector and the description on the way out. Stagehand also
  // offers the method it would call and the arguments it would pass, which
  // belong to acting rather than to looking — and every field here is written to
  // run metadata and read back on the canvas, so what is carried should be what
  // is going to be read.
  const matches = found.map(({ selector, description }) => ({
    selector,
    description,
  }))

  // Nothing found is an answer rather than a failure, which is the whole use of
  // the node: a step asking whether the page offers a Next button wants to be
  // told no, not to have the run stopped on its behalf.
  return { matches, count: matches.length }
}
