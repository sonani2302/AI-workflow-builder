"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"

import { createWorkflow } from "@/features/workflows/data"
import { PRO_PLAN_CHECK } from "@/features/workflows/lib/pro-plan"

export async function createWorkflowAction(name: string) {
  const { orgId, has } = await auth()

  if (!orgId) {
    throw new Error("No active organization")
  }

  // Creating a workflow is what the pro plan buys. The sidebar checks this too,
  // for a nudge to the pricing page rather than an error — but the button is
  // only where the gate is *shown*. This is where it is enforced, because a
  // server action is a public endpoint: anything holding a session can call it,
  // whatever the UI it came from was willing to render.
  //
  // Read off the session token rather than asked of Clerk over the network, so
  // this costs the create nothing. The trade is that a subscription taken out a
  // moment ago is only here once that token is reissued, which is why checkout
  // navigates rather than leaving someone on the pricing page.
  if (!has(PRO_PLAN_CHECK)) {
    throw new Error("Creating workflows requires the pro plan")
  }

  const workflow = await createWorkflow(orgId, name)

  // The workflow list lives in the (dashboard) layout, which sits at "/".
  revalidatePath("/", "layout")

  // redirect() throws NEXT_REDIRECT, so it must stay outside any try/catch.
  redirect(`/workflows/${workflow.id}`)
}
