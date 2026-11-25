import { useLayoutEffect, type ReactNode } from 'react'
import styles from './experiment-page.module.css'

const experiments = {
  'brand-theme': { label: 'Brand style runtime', title: 'Brand style runtime' },
  'dashboard-refresh': { label: 'Dashboard auto refresh', title: 'Dashboard auto refresh' },
  'jonbeo-msw': { label: 'Jonbeo MSW performance', title: 'Jonbeo MSW performance lab' },
} as const

const sections = {
  options: '선택지',
  playground: 'Playground',
  conclusion: '결론',
  verification: '검증 결과',
} as const

type Experiment = keyof typeof experiments
type Section = keyof typeof sections

export function ExperimentPage({ experiment, summary, children }: {
  experiment: Experiment
  summary: { problem: ReactNode; finding: ReactNode; decision: ReactNode }
  children: ReactNode
}) {
  useLayoutEffect(() => {
    // A direct fragment can be resolved only after React has mounted its target.
    const target = document.getElementById(window.location.hash.slice(1))
    target?.scrollIntoView()
  }, [])

  return (
    <div className={styles.page} lang="ko">
      <nav className={styles.experiments} aria-label="실험 이동">
        <a href="/" className={styles.home} lang="en">React experiments</a>
        <ul lang="en">
          {Object.entries(experiments).map(([id, { label }]) => (
            <li key={id}>
              <a href={`/experiments/${id}/`} aria-current={id === experiment ? 'page' : undefined}>{label}</a>
            </li>
          ))}
        </ul>
      </nav>
      <main className={styles.content}>
        <header className={styles.header}>
          <h1 lang="en">{experiments[experiment].title}</h1>
          <section className={styles.summary} aria-labelledby="experiment-summary-title">
            <h2 id="experiment-summary-title">실험 요약</h2>
            <dl>
              <div><dt>문제</dt><dd>{summary.problem}</dd></div>
              <div><dt>확인한 결과</dt><dd>{summary.finding}</dd></div>
              <div><dt>판단</dt><dd>{summary.decision}</dd></div>
            </dl>
          </section>
          <nav className={styles.sections} aria-label="이 페이지에서">
            <ul>
              {Object.entries(sections).map(([id, label]) => (
                <li key={id}><a href={`#${id}`}>{label}</a></li>
              ))}
            </ul>
          </nav>
        </header>
        {children}
      </main>
    </div>
  )
}

export function ExperimentSection({ id, description, children }: { id: Section; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-section-title`}>
      <h2 id={`${id}-section-title`}>{sections[id]}</h2>
      {description && <p className={styles.description}>{description}</p>}
      {children}
    </section>
  )
}

export function ExperimentOptions({ items }: { items: readonly { label: ReactNode; description: ReactNode }[] }) {
  return (
    <dl className={styles.options}>
      {items.map(({ label, description }, index) => (
        <div key={index}>
          <dt>{label}</dt>
          <dd>{description}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ExperimentWorkbench({ children }: { children: ReactNode }) {
  return <div className={styles.workbench}>{children}</div>
}

export function ExperimentTable({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className={styles.tableHint}>좁은 화면에서는 표를 가로로 스크롤할 수 있습니다.</p>
      <div className={styles.tableViewport} role="region" aria-label={`${label} 스크롤 영역`} tabIndex={0}>
        <table className={styles.table} aria-label={label}>{children}</table>
      </div>
    </div>
  )
}

export function ExperimentFrame({ href, title }: { href: string; title: string }) {
  return (
    <div className={styles.frame}>
      <div><a href={href}>Playground 전체 화면 열기 <span aria-hidden="true">↗</span></a></div>
      <iframe src={href} title={title} loading="lazy" />
    </div>
  )
}
