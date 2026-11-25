import { brandProperties } from '../shared/brands'
import type { ThemeScope } from '../shared/dashboard'

export const Scope: ThemeScope = ({ brand, brandId, className, children }) => (
  <section className={className} style={brandProperties(brand)} aria-label="Operations theme" data-brand={brandId}>{children}</section>
)
