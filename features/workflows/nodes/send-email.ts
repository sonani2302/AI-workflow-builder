import {
  NodeInputError,
  type NodeRunContext,
} from "@/features/workflows/nodes/node-contract"
import { getResend } from "@/lib/resend"

// The executor behind the "send-email" registry entry. The first node here that
// has nothing to do with a browser: it reads no page and clicks nothing, so it
// never calls context.browser() and a run made only of these steps never opens a
// Browserbase session at all.

/**
 * Who the mail comes from. Hardcoded because there is nothing on the canvas that
 * could honestly choose it: Resend will only send from a verified domain, and
 * which domains this account has verified is not something a text field on a
 * node knows.
 *
 * resend.dev is Resend's sandbox sender, and it carries a limit worth knowing
 * about: it delivers only to the address the Resend account itself was opened
 * with, and answers 403 for anything else. A real recipient means verifying a
 * domain and sending from that instead.
 */
const FROM = "onboarding@resend.dev"

export type SendEmailResult = {
  /** Resend's id for the message, which is how it is looked up afterwards. */
  id: string
  /** Echoed back so a run's log says where it went without re-reading the node. */
  to: string
  subject: string
}

/**
 * The errors that will say the same thing on the next attempt.
 *
 * Resend names its failures, and the names divide cleanly into the request being
 * wrong and the service being unavailable. Only the second kind is worth another
 * attempt — a malformed address, an unverified sender or a missing key is still
 * malformed, unverified and missing three attempts later, and retrying spends
 * the run's budget to arrive at the same refusal.
 *
 * Listed as what not to retry rather than what to retry, so a name this was
 * written before — Resend adding one — is retried by default. Retrying something
 * hopeless costs a little time; giving up on something transient loses the email.
 */
const permanent = new Set([
  "validation_error",
  "invalid_parameter",
  "invalid_attachment",
  "invalid_from_address",
  "invalid_region",
  "missing_required_field",
  "missing_api_key",
  "invalid_api_key",
  "restricted_api_key",
  "invalid_access",
  "invalid_idempotency_key",
  "invalid_idempotent_request",
  "not_found",
  "method_not_allowed",
])

// Deliberately not a full address grammar. One "@" with something either side
// and no whitespace is what separates a field somebody meant from one still
// holding a sentence or a placeholder that resolved to nothing — the finer
// judgement is Resend's, and it is better placed to make it.
const looksLikeAddress = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Sends one email through Resend.
 *
 * The body goes out as text rather than html, which is the whole reason the
 * field is multi-line: a textarea's value carries its own line breaks, and html
 * collapses them, so the same message that reads as several lines on the canvas
 * would arrive as one paragraph. A node that sends markup is a different node.
 */
export async function sendEmail(
  context: NodeRunContext,
  values: Record<string, string>
): Promise<SendEmailResult> {
  const to = values.to?.trim() ?? ""
  const subject = values.subject?.trim() ?? ""
  // Not trimmed: the body is the message, and leading or trailing blank lines in
  // it were typed on purpose. The check below is for a field nobody filled in.
  const body = values.body ?? ""

  if (!to) {
    throw new NodeInputError("Send Email needs somebody to send to.")
  }

  if (!looksLikeAddress.test(to)) {
    throw new NodeInputError(`Send Email cannot send to "${to}".`)
  }

  if (!subject) {
    throw new NodeInputError("Send Email needs a subject.")
  }

  if (!body.trim()) {
    throw new NodeInputError("Send Email needs a body.")
  }

  // The run and the node together, which is what makes this survive a retry: the
  // task is allowed three attempts, and an attempt is spent whenever a step
  // after this one throws. Without a key, the second attempt walks back through
  // here and sends the email again — the recipient gets two, and nothing in the
  // run looks wrong. Both halves are stable across attempts, so Resend
  // recognises the repeat and answers with the original send instead of making a
  // second one. Well inside the 256 characters a key is allowed, and the run is
  // capped at 300 seconds, which is nowhere near the 24 hours a key lives for.
  const idempotencyKey = `send-email/${context.runId}/${context.nodeId}`

  const { data, error } = await getResend().emails.send(
    { from: FROM, to, subject, text: body },
    { idempotencyKey }
  )

  // The reason this node is written around a check rather than a try: the SDK
  // does not throw when the API refuses. It answers with error set and data null,
  // so an unhandled call reads as a step that worked, and the run would go on —
  // and finish green — with the email never having been sent.
  if (error) {
    const message = `Could not send the email: ${error.message}`

    throw permanent.has(error.name)
      ? new NodeInputError(message)
      : new Error(message)
  }

  return { id: data.id, to, subject }
}
