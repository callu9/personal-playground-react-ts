import { themeVariables } from '../shared/design-system/theme'
import type { ThemeScope } from '../shared/dashboard'

export const Scope: ThemeScope = ({ theme, className, children }) => (
  <section className={className} style={themeVariables(theme.tokens)} aria-label="Operations theme" data-brand={theme.brandId}>{children}</section>
)
