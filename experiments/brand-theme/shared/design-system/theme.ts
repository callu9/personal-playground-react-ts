import type { CSSProperties } from 'react'
import { brands, type Brand, type BrandId } from './brands'
import { baseTokens, type DesignTokens } from './tokens'

export type ResolvedTheme = {
  brandId: BrandId
  name: string
  monogram: string
  pageBackgroundSource: 'default' | 'brand'
  tokens: DesignTokens
}

export function resolveTheme(brandId: BrandId): ResolvedTheme {
  const { name, monogram, overrides }: Brand = brands[brandId]
  return {
    brandId,
    name,
    monogram,
    pageBackgroundSource: overrides.color?.page === undefined ? 'default' : 'brand',
    tokens: {
      color: { ...baseTokens.color, ...overrides.color },
      font: { ...baseTokens.font, ...overrides.font },
      radius: baseTokens.radius,
    },
  }
}

type ThemeVariables = CSSProperties & Record<`--ds-${string}`, string>

export function themeVariables(tokens: DesignTokens): ThemeVariables {
  return {
    '--ds-color-page': tokens.color.page,
    '--ds-color-surface': tokens.color.surface,
    '--ds-color-text': tokens.color.text,
    '--ds-color-text-muted': tokens.color.textMuted,
    '--ds-color-text-subtle': tokens.color.textSubtle,
    '--ds-color-border': tokens.color.border,
    '--ds-color-control-border': tokens.color.controlBorder,
    '--ds-color-divider': tokens.color.divider,
    '--ds-color-accent': tokens.color.accent,
    '--ds-color-accent-soft': tokens.color.accentSoft,
    '--ds-color-accent-ink': tokens.color.accentInk,
    '--ds-color-on-accent': tokens.color.onAccent,
    '--ds-font-body': tokens.font.body,
    '--ds-radius-control': tokens.radius.control,
    '--ds-radius-card': tokens.radius.card,
  }
}
