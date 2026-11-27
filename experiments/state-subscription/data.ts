export interface Stock {
  code: string
  name: string
  shares: number
  currentPrice: number
  profitLossMoney: number
  profitLossRate: number
  series: number[]
}

export const exchangeRate = 1_350
const won = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 })
const dollar = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const plain = new Intl.NumberFormat('ko-KR')

export const formatAmount = (krw: number, isWon: boolean) => isWon ? won.format(krw) : dollar.format(krw / exchangeRate)
export const formatCount = (value: number) => plain.format(value)

// Mulberry32: the same rows on every load, so every approach renders identical data.
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeStocks(count: number): Stock[] {
  const next = random(20261125)
  return Array.from({ length: count }, (_, index) => {
    const shares = 1 + Math.floor(next() * 400)
    const currentPrice = Math.round((5_000 + next() * 400_000) / 10) * 10
    const rate = Math.round((next() * 40 - 15) * 100) / 100
    return {
      code: String(100_000 + index),
      name: `Sample stock ${index + 1}`,
      shares,
      currentPrice,
      profitLossMoney: Math.round(currentPrice * shares * rate / 100),
      profitLossRate: rate,
      series: Array.from({ length: 24 }, () => next()),
    }
  })
}

export const sparklinePoints = (series: number[]) => series.map((value, index) => `${index * 4},${(24 - value * 24).toFixed(1)}`).join(' ')
export const totalValue = (stocks: Stock[]) => stocks.reduce((sum, stock) => sum + stock.currentPrice * stock.shares, 0)
