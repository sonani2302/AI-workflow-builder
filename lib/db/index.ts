import { Pool } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-serverless"

import * as schema from "./schema"

type Database = ReturnType<typeof connect>

function connect() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set")
  }

  // Pooled endpoint: PgBouncer fronts the compute, so this is safe to keep for
  // the life of the process and share across requests.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  return drizzle({ client: pool, schema })
}

let database: Database | undefined

/**
 * Connects on first query rather than at module scope.
 *
 * `next build` evaluates every route module to collect page data, so throwing
 * at import time turns a missing variable into a failed build — on a machine
 * that has no business holding database credentials in the first place. Waiting
 * until a query is actually issued keeps the failure where it belongs: at
 * request time, on the one route that needed the connection.
 */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    database ??= connect()

    const value = database[property as keyof Database]

    return typeof value === "function" ? value.bind(database) : value
  },
})

export * from "./schema"
