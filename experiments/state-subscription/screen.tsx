import { memo, Profiler, useMemo, type ReactNode } from 'react'
import { bindings } from './bindings'
import { readSettings } from './contract'
import { commits, recordCommit, renders } from './counters'
import { formatAmount, formatCount, makeStocks, sparklinePoints, totalValue, type Stock } from './data'
import styles from './state-subscription.module.css'

export const settings = readSettings(window.location.search)
const { Provider, useIsWon, useSelected, useToggle, useSelect } = bindings[settings.approach]

function Info({ stock }: { stock: Stock }) {
  return (
    <div className={styles.info}>
      <div><strong>{stock.name}</strong> <span>({stock.code})</span></div>
      <span>{formatCount(stock.shares)}주</span>
    </div>
  )
}

function Spark({ series }: { series: number[] }) {
  return (
    <svg className={styles.spark} viewBox="0 0 96 24" aria-hidden="true"><polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={sparklinePoints(series)} /></svg>
  )
}

const rate = (stock: Stock) => `(${stock.profitLossRate > 0 ? '+' : ''}${formatCount(stock.profitLossRate)}%)`

function Amount({ krw }: { krw: number }) {
  renders.amount++
  return <span className={styles.amount}>{formatAmount(krw, useIsWon())}</span>
}

function SelectButton({ id }: { id: string }) {
  renders.select++
  const selected = useSelected(id)
  const select = useSelect()
  return <button type="button" data-testid={`select-${id}`} aria-pressed={selected} className={styles.select} onClick={() => select(id)}>{selected ? 'Selected' : 'Select'}</button>
}

// The row subscribes: any change it listens to re-renders the name, the chart and the amounts together.
function SubscribedRow({ stock }: { stock: Stock }) {
  renders.row++
  const isWon = useIsWon()
  const selected = useSelected(stock.code)
  const select = useSelect()
  return (
    <li className={styles.row} data-selected={selected}>
      <Info stock={stock} />
      <Spark series={stock.series} />
      <div className={styles.amounts}>
        <span className={styles.amount}>{formatAmount(stock.currentPrice, isWon)}</span>
        <span className={styles.amount}>{formatAmount(stock.profitLossMoney, isWon)} {rate(stock)}</span>
      </div>
      <button type="button" data-testid={`select-${stock.code}`} aria-pressed={selected} className={styles.select} onClick={() => select(stock.code)}>{selected ? 'Selected' : 'Select'}</button>
    </li>
  )
}

// The leaves subscribe: the row itself is memoized and only the amounts and the button follow the store.
const LeafRow = memo(function LeafRow({ stock }: { stock: Stock }) {
  renders.row++
  return (
    <li className={styles.row}>
      <Info stock={stock} />
      <Spark series={stock.series} />
      <div className={styles.amounts}>
        <Amount krw={stock.currentPrice} />
        <span><Amount krw={stock.profitLossMoney} /> {rate(stock)}</span>
      </div>
      <SelectButton id={stock.code} />
    </li>
  )
})

function Header({ total }: { total: number }) {
  renders.header++
  return <div className={styles.total}><span>Total value</span><strong data-testid="total">{formatAmount(total, useIsWon())}</strong></div>
}

function UnitButton() {
  renders.toggle++
  const isWon = useIsWon()
  const toggle = useToggle()
  return <button type="button" data-testid="unit-toggle" className={styles.toggle} onClick={toggle}>{isWon ? '₩ → $' : '$ → ₩'}</button>
}

export function StockScreen(): ReactNode {
  const stocks = useMemo(() => makeStocks(settings.rows), [])
  const total = useMemo(() => totalValue(stocks), [stocks])
  const Row = settings.placement === 'row' ? SubscribedRow : LeafRow
  return (
    <Profiler id="screen" onRender={recordCommit}>
      <Provider>
        <div className={styles.toolbar}><Header total={total} /><UnitButton /></div>
        <ul className={styles.list} aria-label="Stocks">{stocks.map((stock) => <Row key={stock.code} stock={stock} />)}</ul>
      </Provider>
    </Profiler>
  )
}

export { commits, renders }
