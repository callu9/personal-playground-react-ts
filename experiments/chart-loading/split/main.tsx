import { mountChartPage } from '../shared/ChartPage'

mountChartPage({ strategy: 'split', load: () => import('../shared/chart-runtime') })
