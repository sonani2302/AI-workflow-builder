export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
      <p className="text-sm text-muted-foreground">Workflow</p>
      <p className="font-mono text-sm">{id}</p>
    </div>
  )
}
