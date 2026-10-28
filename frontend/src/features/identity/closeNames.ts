/**
 * Spotting a probable typo in a booking name: a name that's nearly, but not
 * exactly, one already used on bookings ("Sam Kk" for "Sam K").
 */

// How many single-letter edits still count as "nearly" a known name. Short
// names allow fewer, so "Ana" doesn't match every three-letter name.
const SHORT_NAME_LENGTH = 4;
const SHORT_NAME_MAX_EDITS = 1;
const MAX_EDITS = 2;

/** Lowercase, with spaces and punctuation dropped: "Sam K." → "samk". */
function normalize(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** The fewest single-letter inserts, deletes or swaps from `from` to `to`. */
export function countEdits(from: string, to: string): number {
  let previous = Array.from({ length: to.length + 1 }, (_, index) => index);
  for (let row = 1; row <= from.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= to.length; column += 1) {
      const swapCost = from[row - 1] === to[column - 1] ? 0 : 1;
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + swapCost,
      );
    }
    previous = current;
  }
  return previous[to.length];
}

function maxEditsFor(name: string): number {
  return name.length <= SHORT_NAME_LENGTH ? SHORT_NAME_MAX_EDITS : MAX_EDITS;
}

/**
 * The known name `name` was most likely meant to be, or null when it's
 * empty, already a known name (in any case), or not close to any of them.
 */
export function findCloseName(
  name: string,
  knownNames: string[],
): string | null {
  const typed = name.trim();
  const isKnown = knownNames.some(
    (known) => known.toLowerCase() === typed.toLowerCase(),
  );
  if (typed === "" || isKnown) {
    return null;
  }
  const target = normalize(typed);
  const scored = knownNames
    .map((known) => ({ known, edits: countEdits(target, normalize(known)) }))
    .filter(({ edits }) => edits <= maxEditsFor(target));
  scored.sort((a, b) => a.edits - b.edits || a.known.localeCompare(b.known));
  return scored[0]?.known ?? null;
}
