import { mountChartPage } from '../shared/ChartPage'

mountChartPage({ strategy: 'idle', load: () => import('../shared/chart-runtime') })
