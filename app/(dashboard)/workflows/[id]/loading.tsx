import { WorkflowLoading } from "@/features/workflows/components/workflow-loading"

// The first of the two waits: the page's own server work — checking the
// organization, reading the workflow, making sure its room exists, and minting
// a token to read its runs. Nothing can be sent to the browser until all of
// that has come back.
export default function Loading() {
  return <WorkflowLoading label="Opening this workflow…" />
}
