"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import * as Sentry from "@sentry/nextjs"

import { createWorkflow } from "@/features/workflows/data"
import { PRO_PLAN_CHECK } from "@/features/workflows/lib/pro-plan"

export async function createWorkflowAction(name: string) {
  const { orgId, has } = await auth()

  if (!orgId) {
    throw new Error("No active organization")
  }

  Sentry.getIsolationScope().setAttributes({
    action: "createWorkflowAction",
    org_id: orgId,
  })

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
    // Worth a record, and worth it being a warning rather than an error: the
    // sidebar hides the button behind the same check, so a call reaching here
    // is either a session token predating a lapsed plan or a caller going
    // straight at the action. Both are the gate working, not a fault — but a
    // rate of these is the difference between the two.
    Sentry.logger.warn("Create rejected: pro plan required")

    throw new Error("Creating workflows requires the pro plan")
  }

  const workflow = await createWorkflow(orgId, name)

  // The id is what every later log about this workflow is keyed on, and this is
  // the only line that says where it came from.
  Sentry.logger.info("Workflow created", { workflow_id: workflow.id })

  // The workflow list lives in the (dashboard) layout, which sits at "/".
  revalidatePath("/", "layout")

  // redirect() throws NEXT_REDIRECT, so it must stay outside any try/catch.
  redirect(`/workflows/${workflow.id}`)
}
