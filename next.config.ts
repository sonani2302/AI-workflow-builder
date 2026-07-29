import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs"

const nextConfig: NextConfig = {}

export default withSentryConfig(nextConfig, {
  org: "jaimins-org",
  project: "ai-workflow-builder",

  // Build-time secret, and a different thing from the DSN: the DSN says where
  // events go, this authorises uploading the source maps that make them
  // readable. Absent, the build still succeeds and skips the upload — which is
  // what keeps a local `next build` from needing it.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Widens the upload past the route chunks, so a frame in a shared component
  // resolves too rather than showing as minified output.
  widenClientFileUpload: true,

  // Quiet unless this is CI, where the upload log is the only place a failed
  // upload would be noticed.
  silent: !process.env.CI,
})
