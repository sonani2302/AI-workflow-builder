import { Play } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Inspector column of the workflow editor, docked to the right of the canvas.
 */
export function RightSidebar() {
  return (
    <div className="flex size-full items-center justify-center">
      <Button>
        <Play />
        Run
      </Button>
    </div>
  )
}
