export const experimentPath = '/experiments/chart-loading/'

export const strategyLabels = {
  eager: 'Eager',
  split: 'Split',
  observer: 'Viewport',
  idle: 'Viewport + idle preload',
} as const

export type Strategy = keyof typeof strategyLabels
export const chartCount = 12
