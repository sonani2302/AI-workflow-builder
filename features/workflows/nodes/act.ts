import {
  NodeInputError,
  requirePage,
  type NodeRunContext,
} from "@/features/workflows/nodes/node-contract"

// The executor behind the "act" registry entry. Open URL puts the browser
// somewhere; this is what does something once it is there — a click, a value
// typed into a field, a scroll — described in the words a person would use
// rather than as a selector, which is Stagehand's whole reason for being here.

export type ActResult = {
  /** Whether Stagehand carried the instruction out. */
  success: boolean
  /** Its own short account of what it did, or of why it could not. */
  message: string
  /** Where the page is afterwards, which an action that navigates moves. */
  url: string
}

/**
 * Runs one plain-language instruction against the page the run is already on.
 *
 * The instruction is a whole field rather than a selector and a method, so the
 * step survives the markup underneath it changing — which is the point of
 * driving a page this way, and the reason the field is multi-line.
 */
export async function act(
  context: NodeRunContext,
  values: Record<string, string>
): Promise<ActResult> {
  const instruction = values.instruction?.trim() ?? ""

  if (!instruction) {
    throw new NodeInputError("Act needs an instruction to carry out.")
  }

  const stagehand = await context.browser()

  // Acting means acting on something, and nothing here opens a page of its own.
  requirePage(stagehand, "Act")

  const result = await stagehand.act(instruction)

  // Read afterwards, and off whichever page is active by then rather than the
  // one checked above: an action can navigate, and an action can open a tab.
  // Either way this is the page the steps below will arrive on, so it is the
  // one worth reporting.
  const page = stagehand.context.activePage()

  // An instruction Stagehand could not carry out comes back as an ordinary
  // result with success false, and is reported rather than thrown on — the same
  // call open-url makes for a 4xx. Whether it is fatal belongs to the workflow:
  // a step dismissing a cookie banner that was not there has nothing to mourn,
  // and a step that had to click Submit can be branched on by reading success.
  return {
    success: result.success,
    message: result.message,
    url: page?.url() ?? "",
  }
}
