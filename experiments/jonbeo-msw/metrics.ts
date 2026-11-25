import { onINP } from 'web-vitals/attribution'

interface Interaction {
  name: string
  at: number
  duration: number
  inputDelay: number
  processing: number
}

export interface LabMetrics {
  marks: Record<string, number>
  events: Interaction[]
  longTasks: { at: number; duration: number }[]
  firstInput?: Interaction
  inp?: {
    value: number
    at?: number
    inputDelay: number
    processing: number
    presentation: number
    target?: string
  }
  body?: string
  source?: string | null
  error?: string
}

declare global {
  interface Window { jonbeoMetrics: LabMetrics }
}

const metrics: LabMetrics = { marks: {}, events: [], longTasks: [] }
window.jonbeoMetrics = metrics

function observe(type: string, callback: (entries: PerformanceEntry[]) => void, durationThreshold?: number) {
  if (!PerformanceObserver.supportedEntryTypes.includes(type)) return
  new PerformanceObserver((list) => callback(list.getEntries())).observe({ type, buffered: true, durationThreshold })
}

function interaction(entry: PerformanceEventTiming): Interaction {
  return {
    name: entry.name,
    at: entry.startTime,
    duration: entry.duration,
    inputDelay: entry.processingStart - entry.startTime,
    processing: entry.processingEnd - entry.processingStart,
  }
}

observe('first-input', ([entry]) => {
  metrics.firstInput = interaction(entry as PerformanceEventTiming)
})
observe('event', (entries) => {
  for (const entry of entries as PerformanceEventTiming[]) {
    if (entry.interactionId) metrics.events.push(interaction(entry))
  }
}, 16)
observe('longtask', (entries) => {
  metrics.longTasks.push(...entries.map(({ startTime, duration }) => ({ at: startTime, duration })))
})
onINP(({ value, attribution }) => {
  metrics.inp = {
    value,
    at: attribution.interactionTime,
    inputDelay: attribution.inputDelay,
    processing: attribution.processingDuration,
    presentation: attribution.presentationDelay,
    target: attribution.interactionTarget,
  }
}, { reportAllChanges: true, durationThreshold: 16 })

export function mark(name: string) {
  metrics.marks[name] = performance.mark('jonbeo:' + name).startTime
}

export { metrics }
