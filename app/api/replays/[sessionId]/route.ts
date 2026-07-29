import { auth } from "@clerk/nextjs/server"
import * as Sentry from "@sentry/nextjs"
import { NotFoundError } from "@browserbasehq/sdk"

import { getBrowserbase } from "@/lib/browserbase"

/**
 * A workflow run's browser session, as an HLS playlist the browser can play.
 *
 * This exists because the retrieval cannot happen in the browser. Browserbase
 * serves a replay only to the secret API key — the same key that opens sessions
 * and bills for them — so the key stays here and the page asks this route
 * instead. What goes back is the playlist alone: a manifest of already-signed
 * CDN segment URLs, which is the one part of the exchange that is safe to hand
 * out, and which expires on its own six hours later.
 */

/** The playlist's own media type, which is what tells hls.js what it has. */
const HLS_CONTENT_TYPE = "application/vnd.apple.mpegurl"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { userId, orgId } = await auth()

  // An active organization rather than merely a signed-in user. A recording is
  // the most revealing thing a run produces — every page it visited, filled in,
  // and read back — so it sits behind the same gate as the workflows themselves.
  if (!userId || !orgId) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { sessionId } = await params

  // Attributes only — no log line per request. This route is polled until a
  // recording appears, so anything logged on the waiting path would arrive
  // once a second per viewer and drown everything else. What these do is put
  // the session id on the exception if the retrieve below throws for a reason
  // that is not "not yet".
  Sentry.getIsolationScope().setAttributes({
    route: "replays",
    org_id: orgId,
    session_id: sessionId,
  })

  const browserbase = getBrowserbase()

  // Two calls, because that is the shape of the API: a session records one
  // playlist per tab, so the pages have to be listed before one can be fetched.
  let pages

  try {
    ;({ pages } = await browserbase.sessions.replays.retrieve(sessionId))
  } catch (error) {
    // 404 is the not-ready answer as well as the no-such-session answer, and
    // Browserbase gives no way to tell them apart. Reported as not-ready, which
    // is the reading that recovers: a caller polling a session that really has
    // closed gets its recording a moment later, and one polling an id that was
    // never real gives up on its own attempt limit rather than on this status.
    if (error instanceof NotFoundError) {
      return notReady()
    }

    throw error
  }

  // A listing that comes back empty is the same waiting state by another route —
  // the session is known, but nothing has been written for it yet.
  const [page] = pages

  if (!page) {
    return notReady()
  }

  // The first page is the tab the run drove: a session opens with one, and the
  // nodes all act on it unless a step opens another. A run that did open a
  // second tab has a second playlist here that this does not serve, which is
  // worth revisiting when a node can open one.
  const playlist = await browserbase.sessions.replays.retrievePage(
    sessionId,
    page.pageId
  )

  // Once per recording actually served, which is the transition worth having:
  // it marks the end of a poll sequence, so the gap back to the run says how
  // long Browserbase took to make the recording available. page_count is here
  // because a session with more than one tab is the case this route knowingly
  // does not serve in full.
  Sentry.logger.info("Replay playlist served", {
    page_count: pages.length,
  })

  return new Response(await playlist.text(), {
    headers: {
      "Content-Type": HLS_CONTENT_TYPE,
      // Never cached, for two separate reasons: this route is polled, and a
      // cached not-ready would be polled forever; and the segment URLs inside
      // the playlist are signed for six hours, so a copy kept longer than that
      // would hand out a manifest whose every segment has expired.
      "Cache-Control": "no-store",
    },
  })
}

/**
 * The recording is not there yet — ask again.
 *
 * 202 rather than passing Browserbase's own 404 straight out. A 404 from here
 * would be read as "no such route", and this route certainly exists; 202 says
 * the request was understood and the thing it names is still being made, which
 * is exactly the state and is a poll signal a client cannot mistake for failure.
 */
function notReady() {
  return new Response("Recording is not ready yet", {
    status: 202,
    headers: { "Cache-Control": "no-store" },
  })
}
