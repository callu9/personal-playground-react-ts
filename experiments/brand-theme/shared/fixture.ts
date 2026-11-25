export type Status = 'Completed' | 'Running' | 'Failed' | 'Queued'

export const statuses: readonly Status[] = ['Completed', 'Running', 'Failed', 'Queued']

export const results = [
  { id: 'RUN-1042', name: 'Atlas import', source: 'Warehouse', status: 'Completed', updated: '10:42 AM', duration: '2m 14s' },
  { id: 'RUN-1041', name: 'Horizon sync', source: 'CRM', status: 'Running', updated: '10:38 AM', duration: 'In progress' },
  { id: 'RUN-1040', name: 'Ledger export', source: 'Finance API', status: 'Failed', updated: '10:31 AM', duration: '58s' },
  { id: 'RUN-1039', name: 'Inventory scan', source: 'Catalog', status: 'Completed', updated: '10:24 AM', duration: '1m 37s' },
  { id: 'RUN-1038', name: 'Partner refresh', source: 'Partners', status: 'Queued', updated: '10:19 AM', duration: 'Waiting' },
] satisfies Array<{ id: string; name: string; source: string; status: Status; updated: string; duration: string }>

export const metrics = [
  { label: 'Total runs', value: '1,284', note: '+12.4% vs previous week' },
  { label: 'Completion rate', value: '96.8%', note: '+2.1 pts vs previous week' },
  { label: 'Median duration', value: '2m 14s', note: '18s faster vs previous week' },
] as const

export const activity = [
  { day: 'Thu', value: 127 }, { day: 'Fri', value: 159 }, { day: 'Sat', value: 140 },
  { day: 'Sun', value: 196 }, { day: 'Mon', value: 177 }, { day: 'Tue', value: 219 },
  { day: 'Wed', value: 266 },
]
