export const experimentPath = '/experiments/state-subscription/'

export const approachLabels = {
  'context-one': 'Context · one',
  'context-split': 'Context · split',
  'zustand-full': 'Zustand · whole store',
  'zustand-selector': 'Zustand · selector',
} as const

export const placementLabels = {
  row: 'Subscribe in the row',
  leaf: 'Subscribe in the leaves',
} as const

export const rowCounts = [7, 100, 1_000] as const
export const interactions = ['unit', 'select'] as const

export type Approach = keyof typeof approachLabels
export type Placement = keyof typeof placementLabels
export type RowCount = (typeof rowCounts)[number]
export type Interaction = (typeof interactions)[number]

export interface Settings {
  approach: Approach
  placement: Placement
  rows: RowCount
}

export function readSettings(search: string): Settings {
  const query = new URLSearchParams(search)
  const approach = query.get('approach')
  const placement = query.get('placement')
  return {
    approach: approach && Object.hasOwn(approachLabels, approach) ? approach as Approach : 'zustand-full',
    placement: placement && Object.hasOwn(placementLabels, placement) ? placement as Placement : 'row',
    rows: rowCounts.find((value) => value === Number(query.get('rows'))) ?? 100,
  }
}

export const countedComponents = ['row', 'amount', 'select', 'header', 'toggle'] as const
export type Counted = (typeof countedComponents)[number]
