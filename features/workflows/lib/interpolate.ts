import type { JsonValue } from "@/features/workflows/nodes/node-contract"

// Fills a node's field in from what earlier steps produced, so "{{ n2.title }}"
// typed on the canvas becomes the title that step actually read.
//
// Pure, and deliberately without a dependency: no get-by-path utility is
// installed, and the walk below is shorter than the import would be. No React
// and no database here either, so the editor can preview a field the same way
// the run resolves it.

/** Every node's output for one run, keyed by node id. */
export type RunOutputs = Record<string, JsonValue | undefined>

// Anything between {{ and }}. The expression cannot contain a closing brace,
// which a path never does.
const PLACEHOLDER = /\{\{([^}]*)\}\}/g

/**
 * "n2.items[0].name" to ["n2", "items", "0", "name"].
 *
 * Bracket steps are rewritten as dotted ones first so the split has a single
 * shape to deal with. Node ids are uuids, which carry no dots of their own, so
 * the first segment is always the whole id.
 */
function toPath(expression: string): string[] {
  return expression
    .replace(/\[\s*(["'])(.*?)\1\s*\]/g, ".$2") // items["name"] and items['name']
    .replace(/\[\s*(\d+)\s*\]/g, ".$1") // items[0]
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean)
}

/**
 * Walks a path into the run's outputs, or undefined the moment it leads
 * somewhere that is not there. A path that runs into a string or a number
 * partway stops rather than throwing, since a placeholder is typed by hand and
 * pointing it at the wrong shape is an ordinary mistake.
 */
function valueAt(outputs: RunOutputs, path: string[]): JsonValue | undefined {
  const [nodeId, ...rest] = path

  if (!nodeId) {
    return undefined
  }

  let current = outputs[nodeId]

  for (const key of rest) {
    if (current === null || typeof current !== "object") {
      return undefined
    }

    // A non-numeric key against an array gives NaN, and so undefined, which is
    // the same answer as any other step that leads nowhere.
    current = Array.isArray(current) ? current[Number(key)] : current[key]
  }

  return current
}

/** A resolved value as it goes back into the field's text. */
function render(value: JsonValue | undefined): string {
  if (value === undefined || value === null) {
    return ""
  }

  if (typeof value === "string") {
    return value
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }

  // An object or an array, which has no reading as a sentence — the JSON is at
  // least something the next step can be pointed into.
  return JSON.stringify(value)
}

/**
 * Replaces every "{{ nodeId.path }}" in one field's text with what that path
 * points at in this run's outputs.
 *
 * A placeholder that resolves to nothing leaves an empty string, so a field
 * built out of several of them still reads as text rather than keeping the
 * braces of whichever one missed.
 */
export function interpolate(text: string, outputs: RunOutputs): string {
  return text.replace(PLACEHOLDER, (_match, expression: string) =>
    render(valueAt(outputs, toPath(expression)))
  )
}
