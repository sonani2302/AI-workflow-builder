import {
  NodeInputError,
  type NodeRunContext,
} from "@/features/workflows/nodes/node-contract"

// The executor behind the "open-url" registry entry. It is handed the browser
// the run already owns rather than starting one of its own: every step of a
// workflow shares a single session, so a later step lands on the page this one
// left behind.

export type OpenUrlResult = {
  /** Where the page settled, which redirects can move away from the input. */
  url: string
  title: string
  status: number | null
}

// Requires "://" rather than just a colon. A bare "localhost:3000" parses as a
// URL whose protocol is "localhost:", so testing with new URL() alone would
// wave it through and then fail at navigation.
const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i

/**
 * Reads the typed-in URL the way a browser address bar would: a host on its own
 * gets https, and anything that is not http(s) afterwards is refused. The field
 * is free text, so "javascript:" and "file:" are reachable from the canvas and
 * are worth turning away before they reach the page.
 */
function parseUrl(input: string) {
  const trimmed = input.trim()

  if (!trimmed) {
    throw new NodeInputError("Open URL needs a URL to open.")
  }

  const candidate = hasScheme.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL

  try {
    url = new URL(candidate)
  } catch {
    throw new NodeInputError(`Open URL cannot navigate to "${input}".`)
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new NodeInputError(
      `Open URL only opens http and https addresses, not "${url.protocol}".`
    )
  }

  return url.toString()
}

/**
 * Navigates the run's browser to the node's URL.
 *
 * Waits for domcontentloaded rather than the full load event: a step is done
 * when the document is there to be acted on, and waiting on every last tracker
 * and image would spend the run's budget on nothing the next step reads.
 */
export async function openUrl(
  { stagehand }: NodeRunContext,
  values: Record<string, string>
): Promise<OpenUrlResult> {
  const url = parseUrl(values.url ?? "")
  const { context } = stagehand
  const page = context.pages()[0] ?? (await context.newPage())

  const response = await page.goto(url, { waitUntil: "domcontentloaded" })

  // A 4xx or 5xx is reported rather than thrown on. The step did what it was
  // asked — it opened the address — and whether that page is usable is for the
  // steps after it to judge. status is null when the navigation served no
  // response of its own, as a same-document hop does.
  return {
    url: page.url(),
    title: await page.title(),
    status: response?.status() ?? null,
  }
}
