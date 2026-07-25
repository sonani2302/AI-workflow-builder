"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"

import { createWorkflow } from "@/features/workflows/data"

export async function createWorkflowAction(name: string) {
  const { orgId } = await auth()

  if (!orgId) {
    throw new Error("No active organization")
  }

  const workflow = await createWorkflow(orgId, name)

  // The workflow list lives in the (dashboard) layout, which sits at "/".
  revalidatePath("/", "layout")

  // redirect() throws NEXT_REDIRECT, so it must stay outside any try/catch.
  redirect(`/workflows/${workflow.id}`)
}
