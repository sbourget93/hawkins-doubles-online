export interface NameInfo {
  playerId: string
  first: string
  last: string
}

/**
 * Compact display names: show just the first name when it's unique among the
 * shown players; otherwise append the shortest last-name prefix that tells the
 * same-first-name players apart (full last name if two share first and last).
 */
export function computeDisplayNames(infos: NameInfo[]): Map<string, string> {
  const byFirst = new Map<string, NameInfo[]>()
  for (const info of infos) {
    const key = info.first.toLowerCase()
    const group = byFirst.get(key) ?? []
    group.push(info)
    byFirst.set(key, group)
  }
  const labels = new Map<string, string>()
  for (const group of byFirst.values()) {
    if (group.length === 1) {
      labels.set(group[0].playerId, group[0].first)
      continue
    }
    for (const info of group) {
      const last = info.last
      let label = `${info.first} ${last}`.trim() // fallback: full last name
      for (let len = 1; len <= last.length; len++) {
        const prefix = last.slice(0, len).toLowerCase()
        const collisions = group.filter((o) => o.last.toLowerCase().startsWith(prefix)).length
        if (collisions === 1) {
          label = `${info.first} ${last.slice(0, len)}`
          break
        }
      }
      labels.set(info.playerId, label)
    }
  }
  return labels
}
