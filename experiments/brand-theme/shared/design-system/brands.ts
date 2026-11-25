import type { DesignTokens } from './tokens'

type BrandOverrides = {
  color?: Partial<Pick<DesignTokens['color'], 'page' | 'accent' | 'accentSoft' | 'accentInk'>>
  font?: Partial<Pick<DesignTokens['font'], 'body'>>
}

export type Brand = {
  name: string
  monogram: string
  overrides: BrandOverrides
}

export const brands = {
  grove: { name: 'Grove', monogram: 'G', overrides: {} },
  signal: {
    name: 'Signal',
    monogram: 'S',
    overrides: {
      color: { page: '#edf0ff', accent: '#4445b4', accentSoft: '#efedff', accentInk: '#29296f' },
      font: { body: 'Verdana, sans-serif' },
    },
  },
  ember: {
    name: 'Ember',
    monogram: 'E',
    overrides: {
      color: { page: '#fff1e8', accent: '#a04322', accentSoft: '#fff0e7', accentInk: '#703019' },
      font: { body: '"Trebuchet MS", sans-serif' },
    },
  },
} satisfies Record<string, Brand>

export type BrandId = keyof typeof brands
