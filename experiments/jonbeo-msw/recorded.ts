import type { RequestPath } from './contract'

// Rounded from docs/experiments/jonbeo-msw/evidence, first visits only.
type Comparison = readonly [before: number, after: number]
type ColdResults = {
  button: Comparison
  headers: Comparison
  data: Comparison
  inp: Comparison
  repeatedData: Comparison
}

export const coldResults = {
  off: {
    button: [293, 274.4],
    headers: [164.5, 162.9],
    data: [621, 604.8],
    inp: [48, 40],
    repeatedData: [705, 597],
  },
  passthrough: {
    button: [491.3, 289.8],
    headers: [208.5, 217.9],
    data: [709.3, 781.9],
    inp: [40, 40],
    repeatedData: [980.3, 842.9],
  },
  mock: {
    button: [452.1, 280.9],
    headers: [211.8, 209.3],
    data: [662.2, 807.4],
    inp: [40, 40],
    repeatedData: [1109.4, 1080.8],
  },
} as const satisfies Record<RequestPath, ColdResults>

export const originalResults = {
  titleSeconds: [6.44, 0.34],
  navigationToRegisterSeconds: 5.46,
  registerToEnabledMs: 90.6,
  inpMs: [416, 744],
  eventProcessingMs: [314.2, 701],
} as const
