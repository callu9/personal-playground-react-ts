import { mountChartPage } from '../shared/ChartPage'
import * as runtime from '../shared/chart-runtime'

mountChartPage({ strategy: 'eager', runtime, load: () => Promise.resolve(runtime) })
