import { Pool } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-serverless"

import * as schema from "./schema"

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set")
}

// Pooled endpoint: PgBouncer fronts the compute, so this is safe to keep at
// module scope and share across requests.
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export const db = drizzle({ client: pool, schema })

export * from "./schema"
