export const labPath = '/experiments/jonbeo-msw/'
export const workerScope = labPath + 'worker/'
export const portfolioPath = '/api/jonbeo-msw/portfolio'
export const responseDelayMs = 150
export const responseHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
}

export type RequestPath = 'off' | 'passthrough' | 'mock'
export type Variant = 'gated' | 'shell'

export interface Holding {
  code: string
  name: string
  shares: number
  price: number
}

export interface Portfolio {
  holdings: Holding[]
}

const portfolio: Portfolio = {
  holdings: [
    { code: 'MESA', name: 'Mesa Robotics', shares: 12, price: 63.21 },
    { code: 'ATLS', name: 'Atlas Markets', shares: 8, price: 128.31 },
    { code: 'WAVE', name: 'Wave Energy', shares: 22, price: 32.87 },
    { code: 'ORBT', name: 'Orbit Networks', shares: 11, price: 74.13 },
    { code: 'DUNE', name: 'Dune Systems', shares: 32, price: 18.4 },
    { code: 'RIVR', name: 'River Logistics', shares: 7, price: 96.1 },
    { code: 'LMEN', name: 'Lumen Retail', shares: 19, price: 22.24 },
  ],
}

export const portfolioBody = JSON.stringify(portfolio)
