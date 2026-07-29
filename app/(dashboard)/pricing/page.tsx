import { PricingTable } from "@clerk/nextjs"

export default function PricingPage() {
  // The layout above has already established a session and an active
  // organization, which is what `for="organization"` needs to have something to
  // subscribe — so there is nothing left to check here.
  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-6">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Choose a plan
          </h1>
          <p className="text-sm text-muted-foreground">
            Plans are billed per organization, so one subscription covers
            everyone you have invited.
          </p>
        </div>
        {/*
          Organization plans rather than the default user plans: billing is
          enabled for organizations only, so without this the table would look
          up personal subscriptions and render empty.

          Clerk owns everything from here — the plan cards, the checkout drawer,
          and the upgrade and cancellation flows for an organization that
          already subscribes.

          Sending them to the dashboard afterwards is not just a courtesy: a new
          subscription reaches the app through a reissued session token, so
          has({ plan }) — and useProPlan with it — keeps saying "free" until
          something navigates. Landing back on the dashboard is what makes the
          feature they just paid for actually be unlocked when they get there.
        */}
        <PricingTable for="organization" newSubscriptionRedirectUrl="/" />
      </div>
    </div>
  )
}
