import {
  adjectives,
  animals,
  uniqueNamesGenerator,
} from "unique-names-generator"

/** Random hyphenated workflow name, e.g. "brave-otter". */
export function generateSlug() {
  return uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    separator: "-",
    length: 2,
  })
}
