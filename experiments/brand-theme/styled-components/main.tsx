import { ThemeProvider } from 'styled-components'
import { mountDashboard, slots, type Classes, type ThemeScope } from '../shared/dashboard'
import '../shared/document.css'
import { Region } from './Region'

const classes = Object.fromEntries(slots.map((slot) => [slot, `lab-${slot}`])) as Classes

const Scope: ThemeScope = ({ brand, brandId, className, children }) => (
  <ThemeProvider theme={brand}>
    <Region className={className} aria-label="Operations theme" data-brand={brandId}>{children}</Region>
  </ThemeProvider>
)

mountDashboard(classes, Scope)
