import { auth, currentUser } from "@clerk/nextjs/server"

export default async function TestPage() {
  // Redirects unauthenticated users to the sign-in page (/sign-in)
  await auth.protect()

  const user = await currentUser()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-lg font-medium">Protected test page</h1>
      <p className="text-sm text-muted-foreground">
        If you can read this, route protection is working. 🎉
      </p>
      <p className="text-sm text-muted-foreground">
        Signed in as{" "}
        <span className="font-mono">
          {user?.primaryEmailAddress?.emailAddress ?? user?.id}
        </span>
      </p>
    </div>
  )
}
