import { mountChartPage } from '../shared/ChartPage'

mountChartPage({ strategy: 'observer', load: () => import('../shared/chart-runtime') })
