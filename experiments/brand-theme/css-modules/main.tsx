import { createContext, useContext, type ComponentProps } from 'react'
import { themeVariables, type ResolvedTheme } from '../shared/design-system/theme'
import { mountDashboard, type Classes, type ThemeScope } from '../shared/dashboard'
import '../shared/document.css'
import styles from './dashboard.module.css'

const ThemeContext = createContext<ResolvedTheme | null>(null)

function ThemeRegion({ children, ...props }: ComponentProps<'section'>) {
  const theme = useContext(ThemeContext)
  if (!theme) throw new Error('ThemeRegion needs a ThemeProvider')
  return <section {...props} style={themeVariables(theme.tokens)}>{children}</section>
}

const ThemeProvider: ThemeScope = ({ theme, className, children }) => (
  <ThemeContext.Provider value={theme}>
    <ThemeRegion className={className} aria-label="Operations theme" data-brand={theme.brandId}>{children}</ThemeRegion>
  </ThemeContext.Provider>
)

mountDashboard(styles as Classes, ThemeProvider)
