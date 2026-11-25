const repository = 'https://github.com/callu9/personal-playground-react-ts'
const documentRef = 'main'

export function repositoryPath(path: string, view: 'blob' | 'tree' = 'blob') {
  return `${repository}/${view}/${documentRef}/${path}`
}

export const projectDocuments = {
  contents: repositoryPath('README.md'),
  guide: repositoryPath('AGENTS.md'),
}

export const experimentTitles = {
  'brand-theme': { label: 'Brand style runtime', title: 'Brand style runtime' },
  'chart-loading': { label: 'Chart loading', title: 'Chart loading strategies' },
  'dashboard-refresh': { label: 'Dashboard auto refresh', title: 'Dashboard auto refresh' },
  'jonbeo-msw': { label: 'Jonbeo MSW performance', title: 'Jonbeo MSW performance lab' },
} as const

export type Experiment = keyof typeof experimentTitles

export function documentsFor(experiment: Experiment) {
  const directory = `docs/experiments/${experiment}`
  return {
    guide: repositoryPath(`${directory}/README.md`),
    report: repositoryPath(`${directory}/results.md`),
    evidence: repositoryPath(`${directory}/evidence`, 'tree'),
  }
}

export const brandBuildReport = repositoryPath('docs/experiments/brand-theme/build-runtime.md')
