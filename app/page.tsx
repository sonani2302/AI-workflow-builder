import { UserButton } from "@clerk/nextjs"

export default function Page() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <UserButton />
    </div>
  )
}
