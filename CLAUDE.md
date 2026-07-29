<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.claude/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-authoring-chat-agent`, `trigger-authoring-tasks`, `trigger-chat-agent-advanced`, `trigger-cost-savings`, `trigger-getting-started`, `trigger-realtime-and-frontend`.
<!-- TRIGGER.DEV SKILLS END -->

# Adding a workflow node

Three edits, all under `features/workflows/nodes/`:

1. the impl file (e.g. `open-url.ts`) — the node's executor logic,
2. register it in `node-executors.ts` — the `satisfies` contract makes a missing
   executor a compile error for action nodes,
3. add its manifest entry in `node-registry.ts` — kind, label, icon, accent, its
   input `fields`, and the `outputs` downstream nodes can reference.

The run task and the canvas step node are registry-driven — never touch them to add
a node.
