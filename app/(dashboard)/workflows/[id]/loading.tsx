import { Spinner } from "@/components/ui/spinner"

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  )
}
