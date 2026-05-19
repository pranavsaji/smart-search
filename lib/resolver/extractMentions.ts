export function extractMentions(text: string): string[] {
  const matches = text.match(/@([a-zA-Z0-9_-]+)/g) ?? []
  return [...new Set(matches.map(m => m.slice(1).toLowerCase()))]
}
