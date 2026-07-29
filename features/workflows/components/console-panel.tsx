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
  selectionKey,
  type ConsoleSelection,
} from "@/features/workflows/components/logs-panel"

/**
 * The console under the canvas: what each run of this workflow did.
 *
 * The selection is held here rather than in the list below, because it is what
 * the two halves of the console have in common — the list marks the row, and the
 * detail beside it reads the same row. A selection kept inside the list would
 * have to be lifted the moment anything else needed to read it.
 *
 * One piece of state for both kinds of row, which is what makes "only one thing
 * selected at a time" true by construction: selecting a run's replay is the same
 * act as selecting a step, so it displaces whatever was selected before rather
 * than being tracked alongside it.
 */
export function ConsolePanel() {
  const [selected, setSelected] = useState<ConsoleSelection | null>(null)

  function toggle(selection: ConsoleSelection) {
    // Clicking the selected row again clears it, so a row can be let go of
    // without there being somewhere else to click to escape it. Compared by key
    // rather than field by field, so this does not have to know which kinds of
    // selection exist or which fields name them.
    setSelected((current) =>
      current && selectionKey(current) === selectionKey(selection)
        ? null
        : selection
    )
  }

  return (
    // Resizable rather than a fixed split, because which half matters depends
    // on what is being read: a long list of runs on one side, a step's whole
    // output on the other, and the same fifty-fifty will not do for both. The
    // ids keep each panel recognisable across the mount below.
    <ResizablePanelGroup orientation="horizontal" className="size-full">
      <ResizablePanel id="logs" minSize="12rem">
        <LogsPanel selected={selected} onSelect={toggle} />
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
