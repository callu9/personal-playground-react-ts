import type { Counted } from './contract'

export interface Commit {
  phase: string
  actualDuration: number
  baseDuration: number
  startTime: number
  commitTime: number
}

// Read by the measurement script; incremented from component bodies, so they count renders, not commits.
export const renders: Record<Counted, number> = { row: 0, amount: 0, select: 0, header: 0, toggle: 0 }
export const commits: Commit[] = []

declare global {
  interface Window {
    stateRenders: typeof renders
    stateCommits: typeof commits
  }
}
window.stateRenders = renders
window.stateCommits = commits

export function recordCommit(_id: string, phase: string, actualDuration: number, baseDuration: number, startTime: number, commitTime: number) {
  commits.push({ phase, actualDuration, baseDuration, startTime, commitTime })
}
