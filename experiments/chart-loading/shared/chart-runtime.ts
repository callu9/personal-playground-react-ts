import Chart from 'chart.js/auto'
import type { ChartSpec } from './data'

// `chart.js/auto` registers every controller, element and scale, as a quick start would.
export function draw(canvas: HTMLCanvasElement, spec: ChartSpec) {
  return new Chart(canvas, {
    type: spec.kind,
    data: {
      labels: spec.labels,
      datasets: spec.series.map((data, index) => ({ label: `Series ${index + 1}`, data, borderWidth: 1.5, pointRadius: 0 })),
    },
    options: { animation: false, responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
  })
}
