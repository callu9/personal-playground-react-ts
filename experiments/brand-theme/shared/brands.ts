import type { CSSProperties } from 'react'

export const brands = {
  grove: { name: 'Grove', monogram: 'G', accent: '#186649', soft: '#e8f5ee', ink: '#154336', font: 'Georgia, serif' },
  signal: { name: 'Signal', monogram: 'S', accent: '#4445b4', soft: '#efedff', ink: '#29296f', font: 'Verdana, sans-serif' },
  ember: { name: 'Ember', monogram: 'E', accent: '#a04322', soft: '#fff0e7', ink: '#703019', font: '"Trebuchet MS", sans-serif' },
} as const

export type BrandId = keyof typeof brands
export type Brand = { name: string; monogram: string; accent: string; soft: string; ink: string; font: string }
export const defaultBrand: BrandId = 'grove'

export const accounts = [
  { id: 'grove-operator', brand: 'grove' },
  { id: 'signal-operator', brand: 'signal' },
  { id: 'ember-operator', brand: 'ember' },
] as const satisfies ReadonlyArray<{ id: string; brand: BrandId }>

export function resolveBrand(accountId: string, envBrand: string | undefined): BrandId {
  const configured = envBrand && Object.hasOwn(brands, envBrand) ? envBrand as BrandId : defaultBrand
  return accounts.find(({ id }) => id === accountId)?.brand ?? configured
}

export function brandProperties(brand: Brand): CSSProperties {
  return {
    '--brand-accent': brand.accent,
    '--brand-soft': brand.soft,
    '--brand-ink': brand.ink,
    '--brand-font': brand.font,
  } as CSSProperties
}
