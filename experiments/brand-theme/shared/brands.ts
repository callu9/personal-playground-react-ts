import { brands, type BrandId } from './design-system/brands'

const defaultBrand: BrandId = 'grove'

export const accounts = [
  { id: 'grove-operator', brand: 'grove' },
  { id: 'signal-operator', brand: 'signal' },
  { id: 'ember-operator', brand: 'ember' },
] as const satisfies ReadonlyArray<{ id: string; brand: BrandId }>

export function resolveBrand(accountId: string, envBrand: string | undefined): BrandId {
  const configured = envBrand && Object.hasOwn(brands, envBrand) ? envBrand as BrandId : defaultBrand
  return accounts.find(({ id }) => id === accountId)?.brand ?? configured
}
