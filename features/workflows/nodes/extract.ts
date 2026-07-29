import {
  NodeInputError,
  type NodeRunContext,
} from "@/features/workflows/nodes/node-contract"

// The executor behind the "extract" registry entry. The counterpart to act: one
// changes the page, this one only reads it — a price, a heading, the name on an
// order — and leaves what it read where the steps below can name it.

export type ExtractResult = {
  /** What Stagehand read off the page, in its own words. */
  extraction: string
}

/**
 * Reads whatever the instruction describes off the page the run is already on.
 *
 * Stagehand's extract can be handed a schema and answer with typed fields, and
 * this asks for none — a node carries a bag of strings from the canvas and there
 * is nothing on it yet with which to describe a shape. So the default schema is
 * what runs, and the answer is one string: the reading of the page as a
 * sentence, which is the honest thing to offer when nobody said what shape they
 * wanted. A node that takes a schema is a different node, and can be one later.
 */
export async function extract(
  { stagehand }: NodeRunContext,
  values: Record<string, string>
): Promise<ExtractResult> {
  const instruction = values.instruction?.trim() ?? ""

  if (!instruction) {
    throw new NodeInputError("Extract needs to be told what to read.")
  }

  // Reading needs something to read. As with act, nothing here opens a page of
  // its own: an Extract with nothing above it that navigated is a graph drawn
  // wrong, and NodeInputError rather than a plain one because the retry finds
  // the same empty browser.
  const { context } = stagehand

  if (!context.activePage()) {
    throw new NodeInputError(
      "Extract has no page to read. Put an Open URL above it."
    )
  }

  const result = await stagehand.extract(instruction)

  // A page that does not say what was asked for comes back as an empty reading
  // rather than as a failure, and that is left alone: "no price on this page" is
  // an answer, and whether it is an acceptable one belongs to the workflow
  // rather than to the step that went and looked.
  return { extraction: result.extraction }
}
