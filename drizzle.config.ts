import { config } from "dotenv"
import { defineConfig } from "drizzle-kit"

// Next.js loads .env.local automatically; drizzle-kit does not.
config({ path: ".env.local" })

// Migrations run over the direct (unpooled) endpoint: PgBouncer's transaction
// pooling does not support the session-level statements drizzle-kit issues.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL

if (!url) {
  throw new Error("DATABASE_URL_UNPOOLED is not set in .env.local")
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  casing: "snake_case",
})
