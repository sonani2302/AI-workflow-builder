"use client"

import { useEffect, useRef, useState } from "react"
import * as Sentry from "@sentry/nextjs"

import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

// Plays back the browser session a run drove, as video.
//
// The recording is an HLS stream — a manifest listing short video segments,
// rather than one file — which no browser but Safari's plays on its own, so
// hls.js is what turns it into something a <video> can show. It is imported
// lazily below: it is a few hundred kilobytes of media plumbing, and a console
// that is never opened on a run's replay should not pay for it.

/** How long between asks while Browserbase is still writing the recording. */
const POLL_INTERVAL_MS = 2_000

/**
 * How many times to ask before giving up.
 *
 * A limit rather than polling forever, because "not ready" and "no such session"
 * are the same answer from Browserbase — see the route. Without a stop, a replay
 * asked for by an id that was never real would sit there claiming to be loading
 * for as long as the panel stayed open. Thirty tries at two seconds is a minute,
 * which is far longer than a recording has ever taken to appear and short enough
 * that a wrong id gets a straight answer.
 */
const MAX_ATTEMPTS = 30

type ReplayStatus =
  /** Browserbase has not finished writing the recording; still asking. */
  | { kind: "waiting" }
  /** Handed to the player. */
  | { kind: "playing" }
  /** Asked MAX_ATTEMPTS times and never got a playlist. */
  | { kind: "unavailable" }
  | { kind: "error"; message: string }

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * The replay of one Browserbase session.
 *
 * Takes a session id rather than a run, so it stays usable from anywhere that
 * has one — the console panel, a run's own page, or a test harness — and knows
 * nothing about how the run that made it was shaped.
 */
export function SessionReplay({
  sessionId,
  className,
}: {
  sessionId: string
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<ReplayStatus>({ kind: "waiting" })

  // Which session the status above is describing, so a change of session can
  // clear it. Without this, switching from a run with no recording to one that
  // has one would show "No recording for this session" until the first poll of
  // the new one came back.
  //
  // Adjusted during render rather than in the effect below: React's documented
  // way to reset state when a prop changes, and the effect cannot do it — a
  // setState in an effect body lands a render later, so the stale outcome would
  // be shown for a frame first.
  const [statusSessionId, setStatusSessionId] = useState(sessionId)

  if (statusSessionId !== sessionId) {
    setStatusSessionId(sessionId)
    setStatus({ kind: "waiting" })
  }

  useEffect(() => {
    // Everything below has to be able to stop partway: the effect re-runs when
    // the session changes, and a panel can be closed mid-poll. cancelled guards
    // the state updates, the controller cuts off a request already in flight,
    // and hls is destroyed so its own segment fetching stops too.
    let cancelled = false
    const controller = new AbortController()
    let hls: { destroy: () => void } | null = null

    // The route, not Browserbase. Everything here goes through our own origin so
    // the request carries the session cookie and the API key stays server-side.
    const src = `/api/replays/${encodeURIComponent(sessionId)}`

    async function attach() {
      // Dynamic so the library lands in its own chunk — see the note at the top.
      const { default: Hls } = await import("hls.js")

      const video = videoRef.current

      // The element is rendered unconditionally below, so this only fails if the
      // component came apart while the import was still resolving.
      if (cancelled || !video) {
        return
      }

      // The element's own signal that there is really a video here: dimensions
      // and a duration, decoded from the first segment. Waited for rather than
      // calling it played as soon as the playlist is handed over, because
      // everything up to that point is still just text — a player that has been
      // given a URL and has not yet decoded a frame would otherwise be sitting
      // behind a "playing" label showing a black rectangle.
      //
      // Worth knowing when this appears not to fire: Chrome defers loading a
      // media element while its tab is hidden, so a replay opened in a
      // background tab stays on the spinner until the tab is looked at. That is
      // the browser, not the recording.
      video.addEventListener(
        "loadedmetadata",
        () => {
          if (!cancelled) {
            setStatus({ kind: "playing" })
          }
        },
        { once: true }
      )

      // Safari plays HLS natively and does not implement what hls.js needs, so
      // isSupported() is false there. Handing the URL straight to the element is
      // not a fallback in that case, it is the better path: the platform decoder
      // rather than one built out of Media Source Extensions.
      if (!Hls.isSupported()) {
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = src
        } else {
          setStatus({
            kind: "error",
            message: "This browser cannot play session recordings.",
          })
        }

        return
      }

      const player = new Hls()

      hls = player

      player.on(Hls.Events.ERROR, (_event, data) => {
        // Only the fatal ones. hls.js reports recoverable trouble through this
        // same event constantly — a segment that needed a retry, a gap it
        // stitched over — and surfacing those would replace a video that is
        // playing perfectly well with an error message.
        if (data.fatal && !cancelled) {
          // The route served a playlist and the player still could not use it,
          // which is a different failure from the recording not being there —
          // expired segment URLs, or a manifest hls.js would not take. Nothing
          // upstream sees this, so it is reported here or not at all. hls.js'
          // own type and details are the whole diagnosis.
          Sentry.logger.error("Replay playback failed", {
            session_id: sessionId,
            hls_type: String(data.type),
            hls_details: String(data.details),
          })

          setStatus({
            kind: "error",
            message: "The recording could not be played.",
          })
        }
      })

      // loadSource takes the URL and fetches the playlist itself, rather than
      // being handed the text the poll above already has. That is deliberate: a
      // playlist's segment URLs are resolved relative to where the playlist came
      // from, so the player has to know that address. Passing the text through a
      // blob would strand it with nothing to resolve against. The cost is one
      // extra request for a manifest of a few kilobytes.
      player.loadSource(src)
      player.attachMedia(video)
    }

    async function poll() {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (cancelled) {
          return
        }

        let response: Response

        try {
          response = await fetch(src, { signal: controller.signal })
        } catch {
          // Includes the abort on unmount, which is why this returns quietly
          // rather than reporting a failure nobody is left to read. The
          // cancelled check is what keeps that true for the log as well: an
          // abort is the normal way this ends, and reporting it would make
          // closing the panel look like a fault.
          if (!cancelled) {
            Sentry.logger.warn("Could not reach the replay route", {
              session_id: sessionId,
              attempt,
            })

            setStatus({
              kind: "error",
              message: "Could not reach the recording.",
            })
          }

          return
        }

        if (response.ok) {
          await attach()

          return
        }

        // 202 is the route saying the recording is still being written. Anything
        // else — 401 on a session that has expired, 500 — is not going to fix
        // itself by asking again.
        if (response.status !== 202) {
          if (!cancelled) {
            // A 500 here is the route or Browserbase failing and is already an
            // issue from the server side; a 401 is a session that outlived its
            // token. Logged with the status so the two are told apart without
            // opening either.
            Sentry.logger.warn("Replay route refused", {
              session_id: sessionId,
              status: response.status,
              attempt,
            })

            setStatus({
              kind: "error",
              message:
                response.status === 401
                  ? "You do not have access to this recording."
                  : `The recording could not be loaded (${response.status}).`,
            })
          }

          return
        }

        await wait(POLL_INTERVAL_MS)
      }

      if (!cancelled) {
        // A full minute of asking with no playlist. Per the route, this is
        // either a session id that was never real or a recording Browserbase
        // never finished — indistinguishable from here, which is exactly why a
        // rate of these is worth watching: a few is normal, a lot means
        // recordings have stopped appearing.
        Sentry.logger.warn("Replay never became available", {
          session_id: sessionId,
          attempts: MAX_ATTEMPTS,
          waited_ms: MAX_ATTEMPTS * POLL_INTERVAL_MS,
        })

        setStatus({ kind: "unavailable" })
      }
    }

    void poll()

    return () => {
      cancelled = true
      controller.abort()
      hls?.destroy()
    }
  }, [sessionId])

  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-md border border-border bg-black",
        className
      )}
    >
      {/* Mounted from the start rather than once the playlist arrives, because
          the player needs an element to attach to at the moment it is ready.
          Kept invisible until then so the black box does not read as a video
          that failed to start. */}
      <video
        ref={videoRef}
        controls
        playsInline
        className={cn(
          "size-full",
          status.kind === "playing" ? "opacity-100" : "opacity-0"
        )}
      />

      {status.kind === "playing" ? null : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
          {status.kind === "waiting" ? (
            <>
              <Spinner className="size-4" />
              {/* Named as the wait it is. Browserbase finishes writing a
                  recording after the session closes, so a run can be over and
                  its replay still be a few seconds away. */}
              <span>Preparing recording…</span>
            </>
          ) : status.kind === "unavailable" ? (
            <span>No recording for this session.</span>
          ) : (
            <span className="text-destructive">{status.message}</span>
          )}
        </div>
      )}
    </div>
  )
}
