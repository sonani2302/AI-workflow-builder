"use client"

import { useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@clerk/nextjs"

import { PRICING_PATH, PRO_PLAN_CHECK } from "@/features/workflows/lib/pro-plan"

// One place to answer "is this organization paying for pro, and if not, where do
// I send them" — so a gate is a line in a component rather than a repeat of the
// Clerk plumbing below. The server actions ask the same question of the same
// PRO_PLAN_CHECK, so a component and the action behind it cannot disagree.

export type ProPlan = {
  /** Whether the active organization is subscribed to pro. */
  isPro: boolean
  /**
   * False until Clerk has the session on the client. `isPro` is false while it
   * is, so gate on this before showing an upgrade prompt — otherwise every
   * paying organization sees one flash by on first paint.
   */
  isLoaded: boolean
  /** Send the caller to the pricing page to subscribe. */
  upgrade: () => void
  /** Where `upgrade` goes, for rendering a `<Link>` instead of a handler. */
  pricingPath: string
}

/**
 * Whether the active organization is on pro, and how to go and buy it.
 *
 * Reads the session token rather than asking Clerk over the network, so this
 * costs nothing to call from as many components as want it. The flip side is
 * that a fresh subscription only lands here once that token is reissued, which
 * is why the pricing page navigates away after checkout instead of leaving
 * someone sitting on a page that still believes they are on the free plan.
 */
export function useProPlan(): ProPlan {
  const { has, isLoaded } = useAuth()
  const router = useRouter()

  // Optional call: `has` is undefined until Clerk has the session, which is
  // what isLoaded reports.
  const isPro = has?.(PRO_PLAN_CHECK) ?? false

  const upgrade = useCallback(() => {
    router.push(PRICING_PATH)
  }, [router])

  // Memoized on the answer rather than on Clerk's `has`, which is a new
  // function on every render: this way the object a caller holds only changes
  // when the organization's plan actually does.
  return useMemo(
    () => ({ isPro, isLoaded, upgrade, pricingPath: PRICING_PATH }),
    [isPro, isLoaded, upgrade]
  )
}
