import { createContext, useContext, type ComponentProps } from 'react'
import { brandProperties, type Brand } from '../shared/brands'
import { mountDashboard, type Classes, type ThemeScope } from '../shared/dashboard'
import '../shared/document.css'
import styles from './dashboard.module.css'

const ThemeContext = createContext<Brand | null>(null)

function ThemeRegion({ children, ...props }: ComponentProps<'section'>) {
  const theme = useContext(ThemeContext)
  if (!theme) throw new Error('ThemeRegion needs a ThemeProvider')
  return <section {...props} style={brandProperties(theme)}>{children}</section>
}

const ThemeProvider: ThemeScope = ({ brand, brandId, className, children }) => (
  <ThemeContext.Provider value={brand}>
    <ThemeRegion className={className} aria-label="Operations theme" data-brand={brandId}>{children}</ThemeRegion>
  </ThemeContext.Provider>
)

mountDashboard(styles as Classes, ThemeProvider)
