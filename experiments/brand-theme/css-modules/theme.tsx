import { createContext, useContext, type ComponentProps } from 'react'
import { themeVariables, type ResolvedTheme } from '../shared/design-system/theme'
import type { Classes, ThemeScope } from '../shared/dashboard'
import styles from './dashboard.module.css'

const ThemeContext = createContext<ResolvedTheme | null>(null)

function ThemeRegion({ children, ...props }: ComponentProps<'section'>) {
  const theme = useContext(ThemeContext)
  if (!theme) throw new Error('ThemeRegion needs a ThemeProvider')
  return <section {...props} style={themeVariables(theme.tokens)}>{children}</section>
}

export const ThemeProvider: ThemeScope = ({ theme, className, children }) => (
  <ThemeContext.Provider value={theme}>
    <ThemeRegion className={className} aria-label="Operations theme" data-brand={theme.brandId}>{children}</ThemeRegion>
  </ThemeContext.Provider>
)

export const classes = styles as Classes
