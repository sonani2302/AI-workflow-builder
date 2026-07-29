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
  status: number
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

  // A host of one label is almost always a typo reaching this far: new URL()
  // accepts anything shaped like a name, so "1234" and "indvfbvdfgbgdfb" parse
  // as happily as a real address. Turning them away here rather than at
  // navigation is what makes a mistyped field fail at once, instead of paying
  // for a browser session to go and look.
  //
  // The cost is a single-label intranet name — "http://wiki" — which is legal
  // and is refused. localhost and address literals are the exceptions worth
  // keeping, since both are real things to point a step at.
  const { hostname } = url

  const named =
    hostname.includes(".") ||
    hostname.startsWith("[") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost")

  if (!named) {
    throw new NodeInputError(
      `"${input}" is not a website address Open URL can reach.`
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
  { browser }: NodeRunContext,
  values: Record<string, string>
): Promise<OpenUrlResult> {
  // Read before the browser is asked for, which is what lets the note in
  // parseUrl about not paying for a session mean what it says: a mistyped field
  // is turned away here, and nothing has been opened yet to turn away from.
  const url = parseUrl(values.url ?? "")

  const { context } = await browser()
  const page = context.pages()[0] ?? (await context.newPage())

  const response = await page.goto(url, { waitUntil: "domcontentloaded" })

  // No response means nothing was served. A navigation that cannot be made at
  // all — a host that does not resolve, a connection refused — does not throw
  // here: the browser shows its own error page, that page is a document, and so
  // domcontentloaded fires and goto returns with nothing behind it. Left alone
  // this reads as a step that worked, and the run goes on to the next one with
  // the browser sitting on an error page.
  if (!response) {
    throw new Error(`${url} could not be reached.`)
  }

  // A 4xx or 5xx is reported rather than thrown on. Something answered, and
  // whether that page is usable is for the steps after it to judge — which is
  // not the same as never having arrived.
  return {
    url: page.url(),
    title: await page.title(),
    status: response.status(),
  }
}
