// What "on pro" means, in the one place both sides of the gate can read it.
//
// Not in the hook next door, because that is a "use client" module and the
// server actions have to ask the same question — a constant reached across that
// boundary is not a constant any more. So it lives here, plain, and the hook
// imports it like everything else does.

/**
 * The plan's slug as configured in Clerk.
 *
 * Unprefixed, because that is the form Clerk's own components take — the `org:`
 * scope belongs to the check below rather than to the plan.
 */
export const PRO_PLAN_SLUG = "pro"

/**
 * The argument to `has()`, on the server via `auth()` or on the client via
 * `useAuth()`.
 *
 * `org:` scopes the check to the active organization's subscription. Without it
 * Clerk would also accept a *user* plan of the same slug, so someone's personal
 * subscription could unlock an organization they happen to belong to. The prefix
 * is also what makes an absent active organization answer false rather than fall
 * through to whatever the person themselves is paying for.
 *
 * Shared as the whole argument rather than as the string, so the two sides
 * cannot drift on the prefix — the part that is easy to leave off and silent
 * when you do.
 */
export const PRO_PLAN_CHECK = { plan: `org:${PRO_PLAN_SLUG}` } as const

/** The pricing page, which lives inside the dashboard layout. */
export const PRICING_PATH = "/pricing"
