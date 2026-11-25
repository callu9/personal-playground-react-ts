import { Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, CheckCircle2, Database, Gauge, LayoutDashboard, ListChecks, Search, Timer, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ComponentType, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { accounts, resolveBrand } from './brands'
import { brands } from './design-system/brands'
import { resolveTheme, type ResolvedTheme } from './design-system/theme'
import { dashboardFixture, statuses, type DashboardData, type Status } from './fixture'

export const slots = [
  'shell', 'sidebar', 'identity', 'mark', 'nav', 'back', 'workspace', 'topbar',
  'account', 'content', 'intro', 'eyebrow', 'period', 'metrics', 'card', 'metricHead',
  'metricValue', 'metricNote', 'analytics', 'panelHead', 'bars', 'bar', 'day',
  'breakdown', 'statusRow', 'badge', 'results', 'filters', 'search', 'tableWrap',
  'table', 'job', 'jobIcon', 'action', 'empty', 'dialog', 'dialogHead', 'detail',
  'footer',
] as const

export type Classes = Record<(typeof slots)[number], string>
type ThemeScopeProps = { theme: ResolvedTheme; className: string; children: ReactNode }
export type ThemeScope = ComponentType<ThemeScopeProps>

export type Components = {
  Card: ComponentType<ComponentPropsWithoutRef<'section'>>
  Button: ComponentType<ComponentPropsWithoutRef<'button'>>
  Badge: ComponentType<ComponentPropsWithoutRef<'span'>>
}

const plainComponents: Components = {
  Card: (props) => <section {...props} />,
  Button: (props) => <button {...props} />,
  Badge: (props) => <span {...props} />,
}

const sessionKey = 'brand-theme-demo-account'
const labels = { Completed: 'completed', Running: 'running', Failed: 'failed', Queued: 'queued' } as const
const metricIcons = [Gauge, CheckCircle2, Timer]

type DashboardResult = DashboardData['results'][number]

function storedAccount() {
  try {
    const value = sessionStorage.getItem(sessionKey)
    return accounts.find(({ id }) => id === value)?.id ?? ''
  } catch {
    return ''
  }
}

function Details({ item, c, Button, onClose }: {
  item: DashboardResult
  c: Classes
  Button: Components['Button']
  onClose: () => void
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    return () => { if (dialog.open) dialog.close() }
  }, [])

  return (
    <dialog ref={dialogRef} className={c.dialog} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose() }}>
      <div className={c.dialogHead}>
        <div><p className={c.eyebrow}>{item.id}</p><h2 id={titleId}>{item.name}</h2></div>
        <Button type="button" className={c.action} onClick={onClose} aria-label="Close details" autoFocus><X aria-hidden="true" size={16} /></Button>
      </div>
      <dl className={c.detail}>
        <div><dt>Status</dt><dd>{item.status}</dd></div>
        <div><dt>Source</dt><dd>{item.source}</dd></div>
        <div><dt>Last update</dt><dd>{item.updated}</dd></div>
        <div><dt>Duration</dt><dd>{item.duration}</dd></div>
      </dl>
    </dialog>
  )
}

export function Dashboard({ c, Scope, components = plainComponents, data = dashboardFixture, live }: {
  c: Classes
  Scope: ThemeScope
  components?: Components
  data?: DashboardData
  live?: { version: number; recordedAt: number }
}) {
  const [account, setAccount] = useState<string>(storedAccount)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status | ''>('')
  const [selected, setSelected] = useState<DashboardResult | null>(null)
  const portalRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const brandId = resolveBrand(account, import.meta.env.VITE_DEFAULT_BRAND)
  const theme = useMemo(() => resolveTheme(brandId), [brandId])
  const { Card, Button, Badge } = components
  const { activity, metrics, results } = data
  const Content = live ? 'section' : 'main'
  const Heading = live ? 'h3' : 'h1'
  const search = query.trim().toLowerCase()
  const visibleResults = results.filter((item) => (
    (!status || item.status === status) && `${item.name} ${item.id} ${item.source}`.toLowerCase().includes(search)
  ))

  function changeAccount(value: string) {
    setAccount(value)
    try {
      if (value) sessionStorage.setItem(sessionKey, value)
      else sessionStorage.removeItem(sessionKey)
    } catch {
      // A browser without session storage can still switch brands for this page.
    }
  }

  function closeDetails() {
    setSelected(null)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <Scope theme={theme} className={c.shell}>
      <aside className={c.sidebar}>
        <div className={c.identity}>
          <span className={c.mark} aria-hidden="true">{theme.monogram}</span>
          <div><strong>{theme.name}</strong><small>Operations workspace</small></div>
        </div>
        <nav className={c.nav} aria-label="Dashboard">
          <a href="#overview"><LayoutDashboard aria-hidden="true" size={17} /> Overview</a>
          <a href="#activity"><Activity aria-hidden="true" size={17} /> Run activity</a>
          <a href="#results"><ListChecks aria-hidden="true" size={17} /> Recent results</a>
        </nav>
        <a className={c.back} href={live ? '/experiments/dashboard-refresh/#playground' : '/experiments/brand-theme/#playground'} target="_top"><ArrowLeft aria-hidden="true" size={15} /> {live ? 'Dashboard refresh experiment' : 'Brand theme experiment'}</a>
      </aside>
      <div className={c.workspace}>
        <header className={c.topbar}>
          <span>
            Workspace <span aria-hidden="true">/</span> Operations
            <span aria-hidden="true"> · </span>
            <small>Page background: {theme.pageBackgroundSource === 'brand' ? 'Brand color' : 'Default'}</small>
          </span>
          <label className={c.account}>Demo account
            <select value={account} onChange={(event) => changeAccount(event.target.value)}>
              <option value="">Signed out</option>
              {accounts.map(({ id, brand: accountBrand }) => <option key={id} value={id}>{brands[accountBrand].name} operator</option>)}
            </select>
          </label>
        </header>
        <Content className={c.content} id="overview">
          <header className={c.intro}>
            <div><p className={c.eyebrow}>Pipeline monitor</p><Heading>Operations overview</Heading><p>Track pipeline health and review the latest execution results.</p></div>
            <span className={c.period}>{live ? `Live snapshot · v${live.version}` : 'Nov 19–25, 2026'}</span>
          </header>
          <div className={c.metrics} aria-label="Weekly metrics" data-testid={live ? 'live-metrics' : undefined} data-version={live?.version} data-recorded-at={live?.recordedAt}>
            {metrics.map(({ label, value, note }, index) => {
              const Icon = metricIcons[index]
              const Trend = index === 2 ? ArrowDownRight : ArrowUpRight
              return <Card key={label} className={c.card}>
                <div className={c.metricHead}><h2>{label}</h2><Icon aria-hidden="true" size={18} /></div>
                <p className={c.metricValue}>{value}</p>
                <p className={c.metricNote}><Trend aria-hidden="true" size={15} /> {note}</p>
              </Card>
            })}
          </div>
          <div className={c.analytics} id="activity">
            <Card className={c.card}>
              <div className={c.panelHead}><div><h2>Run activity</h2><p>Daily executions over the last 7 days</p></div><Activity aria-hidden="true" size={19} /></div>
              <div className={c.bars} role="img" aria-label={activity.map(({ day, value }) => `${day}: ${value} runs`).join(', ')}>
                {activity.map(({ day, value }) => <div key={day} className={c.day} aria-hidden="true">
                  <span>{value}</span><span className={c.bar} style={{ height: value / 2.5 }} /><span>{day}</span>
                </div>)}
              </div>
            </Card>
            <Card className={c.card}>
              <div className={c.panelHead}><div><h2>Status breakdown</h2><p>Most recent 5 runs</p></div><ListChecks aria-hidden="true" size={19} /></div>
              <ul className={c.breakdown}>
                {statuses.map((value) => <li key={value} className={c.statusRow}>
                  <Badge className={c.badge} data-status={labels[value]}>{value}</Badge>
                  <strong>{results.filter((row) => row.status === value).length}</strong>
                </li>)}
              </ul>
            </Card>
          </div>
          <Card className={`${c.card} ${c.results}`} id="results">
            <header className={c.panelHead}>
              <div><h2>Recent results</h2><p aria-live="polite">Showing {visibleResults.length} of {results.length} runs</p></div>
              <div className={c.filters}>
                <label className={c.search}><Search aria-hidden="true" size={16} /><input aria-label="Search results" placeholder="Search runs…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
                <select aria-label="Result status" value={status} onChange={(event) => {
                  setStatus(statuses.find((value) => value === event.target.value) ?? '')
                }}>
                  <option value="">All statuses</option>
                  {statuses.map((value) => <option key={value}>{value}</option>)}
                </select>
              </div>
            </header>
            <div className={c.tableWrap}>
              <table className={c.table}>
                <thead><tr>{['Run', 'Source', 'Status', 'Updated', 'Duration', 'Details'].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
                <tbody>
                  {visibleResults.map((item) => <tr key={item.id}>
                    <th scope="row"><div className={c.job}><span className={c.jobIcon}><Database size={15} aria-hidden="true" /></span><div>{item.name}<small>{item.id}</small></div></div></th>
                    <td>{item.source}</td>
                    <td><Badge className={c.badge} data-status={labels[item.status]}>{item.status}</Badge></td>
                    <td>{item.updated}</td>
                    <td>{item.duration}</td>
                    <td><Button className={c.action} type="button" aria-label={`View ${item.name}`} onClick={(event) => {
                      triggerRef.current = event.currentTarget
                      setSelected(item)
                    }}><ArrowRight aria-hidden="true" size={16} /></Button></td>
                  </tr>)}
                  {!visibleResults.length && <tr><td colSpan={6} className={c.empty}>No matching results.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <footer className={c.footer}>{live ? <>Server updated <time dateTime={new Date(live.recordedAt).toISOString()}>{new Date(live.recordedAt).toLocaleTimeString('en-US', { timeZone: 'UTC' })} UTC</time></> : 'Sample data · Nov 25, 2026'}</footer>
        </Content>
      </div>
      <div ref={portalRef} style={{ display: 'contents' }} />
      {selected && portalRef.current && createPortal(<Details item={selected} c={c} Button={Button} onClose={closeDetails} />, portalRef.current)}
    </Scope>
  )
}

export function mountDashboard(c: Classes, Scope: ThemeScope, components?: Components) {
  const root = document.getElementById('root')
  if (!root) throw new Error('Dashboard mount point is missing')
  createRoot(root).render(<Dashboard c={c} Scope={Scope} components={components} />)
}
