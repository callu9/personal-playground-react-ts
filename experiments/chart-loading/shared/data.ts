export interface ChartSpec {
  id: number
  kind: 'line' | 'bar'
  title: string
  labels: string[]
  series: number[][]
}

// Mulberry32: every load renders the same charts.
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeSpecs(count: number): ChartSpec[] {
  const next = random(20261126)
  return Array.from({ length: count }, (_, id) => {
    const kind = id % 3 === 2 ? 'bar' : 'line'
    const points = kind === 'bar' ? 48 : 1_200
    let level = [50, 30]
    return {
      id, kind, title: `${kind === 'bar' ? 'Daily volume' : 'Latency trace'} ${id + 1}`,
      labels: Array.from({ length: points }, (_, index) => String(index + 1)),
      series: level.map((_, line) => Array.from({ length: points }, () => {
        level[line] = Math.max(1, level[line] + (next() - 0.5) * 6)
        return Math.round(level[line] * 10) / 10
      })),
    }
  })
}
