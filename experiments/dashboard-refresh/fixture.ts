import { dashboardFixture, statuses } from '../brand-theme/shared/fixture.ts'
import type { Snapshot } from './contract.ts'

export const cycleMs = 16_000
export const normalDelayMs = 40
export const slowDelayMs = 1_350
export const outageStartMs = 9_600
export const outageEndMs = 13_200

// Two infrequent changes followed by eight changes in a burst. Each cycle repeats its timing.
const updateOffsets = [3_800, 7_800, 9_000, 9_500, 10_000, 10_500, 11_000, 11_500, 12_000, 12_500]
const rows = dashboardFixture.results
const number = new Intl.NumberFormat('en-US')
const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'UTC' })
const duration = (seconds: number) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`

function timeFor(startedAt: number, version: number, pace: number) {
  if (version === 0) return startedAt
  const index = (version - 1) % updateOffsets.length
  const cycle = Math.floor((version - 1) / updateOffsets.length)
  return startedAt + (cycle * cycleMs + updateOffsets[index]) * pace
}

function recentResults(startedAt: number, version: number, pace: number) {
  const retained = Math.min(rows.length, version)
  const incoming = Array.from({ length: retained }, (_, index) => {
    const revision = version - index
    const template = rows[rows.length - 1 - ((revision - 1) % rows.length)]
    const status = statuses[(revision + 3) % statuses.length]
    return {
      ...template,
      id: `RUN-${1042 + revision}`,
      status,
      updated: time.format(timeFor(startedAt, revision, pace)),
      duration: status === 'Queued' ? 'Waiting' : status === 'Running' ? 'In progress' : duration(59 + (revision * 13) % 95),
    }
  })
  return [...incoming, ...rows.slice(0, rows.length - retained)]
}

export function snapshotFor(startedAt: number, version: number, pace = 1): Snapshot {
  const phase = version > 0 && (version - 1) % updateOffsets.length >= 2 ? 'burst' : 'steady'
  const total = 1284 + version
  const completionRate = 96.8 + (version % 9 - 4) / 10
  const medianSeconds = 134 + (version * 3) % 17 - 8
  const values = [number.format(total), `${completionRate.toFixed(1)}%`, duration(medianSeconds)]
  const notes = [
    `+${((total / 1142 - 1) * 100).toFixed(1)}% vs previous week`,
    `+${(completionRate - 94.7).toFixed(1)} pts vs previous week`,
    `${152 - medianSeconds}s faster vs previous week`,
  ]
  return {
    version,
    recordedAt: timeFor(startedAt, version, pace),
    phase,
    data: version === 0 ? dashboardFixture : {
      metrics: dashboardFixture.metrics.map((metric, index) => ({
        ...metric,
        value: values[index],
        note: notes[index],
      })),
      activity: dashboardFixture.activity.map((item, index) =>
        index === dashboardFixture.activity.length - 1 ? { ...item, value: item.value + version % 64 } : item
      ),
      results: recentResults(startedAt, version, pace),
    },
  }
}

export function versionAt(startedAt: number, now: number, pace = 1) {
  const elapsed = Math.max(0, (now - startedAt) / pace)
  const cycle = Math.floor(elapsed / cycleMs)
  const inCycle = elapsed % cycleMs
  return cycle * updateOffsets.length + updateOffsets.filter((offset) => offset <= inCycle).length
}

export function snapshotAt(startedAt: number, now: number, pace = 1) {
  return snapshotFor(startedAt, versionAt(startedAt, now, pace), pace)
}
