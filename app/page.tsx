import { OrganizationSwitcher, UserButton } from "@clerk/nextjs"

export default function Page() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
      <UserButton />
      <OrganizationSwitcher />
    </div>
  )
}
