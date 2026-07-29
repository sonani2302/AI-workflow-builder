import { defineConfig } from "@trigger.dev/sdk"

export default defineConfig({
  project: "proj_mufrbowvawawxazhamuw",
  runtime: "node",
  logLevel: "log",
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  // Tasks live with the feature they belong to rather than in a top-level
  // /trigger directory. A feature outside workflows needs its own entry here.
  dirs: ["./features/workflows/task"],
  build: {
    // Stagehand is left out of the bundle and required from node_modules at run
    // time. Inlining it pulls its whole dependency tree — pino, ws, the
    // Browserbase SDK — into the one chunk the task process loads on every run,
    // which is both a large process to start and the reason pino could not find
    // its worker. Kept external, the process starts smaller and each of those
    // resolves its own files the way it expects to.
    external: ["@browserbasehq/stagehand"],
  },
})
