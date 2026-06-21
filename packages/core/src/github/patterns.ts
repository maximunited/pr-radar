/** Converts a glob-like pattern (supports * and ?) to a RegExp. */
export function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

export function matchesAny(name: string, patterns: string[]): boolean {
  return patterns.some((p) => patternToRegex(p).test(name));
}
