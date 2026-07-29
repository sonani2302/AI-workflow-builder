"use client"

import { useState } from "react"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { InspectorPanel } from "@/features/workflows/components/inspector-panel"
import {
  LogsPanel,
  type SelectedStep,
} from "@/features/workflows/components/logs-panel"

/**
 * The console under the canvas: what each run of this workflow did.
 *
 * The selected step is held here rather than in the list below, because it is
 * what the two halves of the console have in common — the list marks the row,
 * and the detail beside it reads the same step. A selection kept inside the list
 * would have to be lifted the moment anything else needed to read it.
 */
export function ConsolePanel() {
  const [selected, setSelected] = useState<SelectedStep | null>(null)

  function toggle(step: SelectedStep) {
    // Clicking the selected step again clears it, so a row can be let go of
    // without there being somewhere else to click to escape it.
    setSelected((current) =>
      current?.runId === step.runId && current?.nodeId === step.nodeId
        ? null
        : step
    )
  }

  return (
    // Resizable rather than a fixed split, because which half matters depends
    // on what is being read: a long list of runs on one side, a step's whole
    // output on the other, and the same fifty-fifty will not do for both. The
    // ids keep each panel recognisable across the mount below.
    <ResizablePanelGroup orientation="horizontal" className="size-full">
      <ResizablePanel id="logs" minSize="12rem">
        <LogsPanel selected={selected} onStepClick={toggle} />
      </ResizablePanel>

      {/* Handle and output panel together, only while something is selected: a
          divider with nothing behind it would be a split you could drag into
          empty space, so the console is the full width of the run list until
          there is a result to put beside it. */}
      {selected ? (
        <>
          <ResizableHandle withHandle />

          <ResizablePanel id="output" defaultSize="24rem" minSize="12rem">
            <InspectorPanel selected={selected} />
          </ResizablePanel>
        </>
      ) : null}
    </ResizablePanelGroup>
  )
}
