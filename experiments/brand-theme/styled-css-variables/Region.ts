import { styled } from 'styled-components'
import { themeVariables } from '../shared/design-system/theme'
import type { DesignTokens } from '../shared/design-system/tokens'

declare module 'styled-components' {
  export interface DefaultTheme extends DesignTokens {}
}

// The theme only fills CSS variables on the region; the rules below never read it, so a new brand adds no rules.
export const Region = styled.section.attrs(({ theme }) => ({ style: themeVariables(theme) }))`
    min-height: 100vh;
    display: grid;
    grid-template-columns: 214px minmax(0, 1fr);
    background: var(--ds-color-page);
    color: var(--ds-color-text);
    font-family: var(--ds-font-body);
    font-size: 14px;
  & h1, & h2, & p { margin: 0; }
  & h2 { font-size: 17px; line-height: 1.3; }
  & select, .lab-search {
    min-height: 36px;
    border: 1px solid var(--ds-color-control-border);
    border-radius: var(--ds-radius-control);
    background: var(--ds-color-surface);
    color: var(--ds-color-text);
  }
  & select { padding: 0 9px; }
  .lab-sidebar { display: flex; flex-direction: column; gap: 35px; padding: 24px 17px; border-right: 1px solid var(--ds-color-border); background: var(--ds-color-surface); }
  .lab-identity { display: flex; align-items: center; gap: 10px; padding: 0 4px; }
  .lab-identity strong { display: block; font-size: 21px; line-height: 1.12; color: var(--ds-color-accent-ink); }
  .lab-identity small { display: block; margin-top: 4px; color: var(--ds-color-text-muted); font-size: 11px; white-space: nowrap; }
  .lab-mark { display: grid; width: 39px; height: 39px; flex: none; place-items: center; border-radius: 11px; background: var(--ds-color-accent); color: var(--ds-color-on-accent); font-size: 23px; font-weight: 700; }
  .lab-nav { display: grid; gap: 5px; }
  .lab-nav a, .lab-back { display: flex; min-height: 39px; align-items: center; gap: 9px; padding: 0 9px; border-radius: var(--ds-radius-control); text-decoration: none; }
  .lab-nav a:first-child, .lab-nav a:hover, .lab-back:hover { background: var(--ds-color-accent-soft); color: var(--ds-color-accent-ink); }
  .lab-back { margin-top: auto; color: var(--ds-color-text-muted); font-size: 12px; }
  .lab-workspace { min-width: 0; }
  .lab-topbar { display: flex; min-height: 68px; justify-content: space-between; align-items: center; gap: 12px; padding: 11px 32px; border-bottom: 1px solid var(--ds-color-border); background: var(--ds-color-surface); }
  .lab-topbar > span { color: var(--ds-color-text-muted); }
  .lab-topbar > span span { padding: 0 5px; color: var(--ds-color-text-subtle); }
  .lab-account { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; }
  .lab-account select { font-weight: 400; }
  .lab-content { display: grid; gap: 18px; max-width: 1500px; margin: 0 auto; padding: 31px 32px 18px; }
  .lab-intro { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 3px; }
  .lab-intro h1 { margin: 4px 0 6px; font-size: clamp(27px, 3.4vw, 42px); line-height: 1.12; letter-spacing: -0.035em; }
  .lab-eyebrow { color: var(--ds-color-accent-ink); font-size: 11px; font-weight: 700; letter-spacing: 0.095em; text-transform: uppercase; }
  .lab-intro h1 + p, .lab-panelHead p { color: var(--ds-color-text-muted); line-height: 1.45; }
  .lab-period { padding: 8px 10px; border: 1px solid var(--ds-color-control-border); border-radius: var(--ds-radius-control); background: var(--ds-color-surface); white-space: nowrap; }
  .lab-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
  .lab-card { min-width: 0; padding: 16px 18px; border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-card); background: var(--ds-color-surface); box-shadow: 0 1px 2px #1825200a; }
  .lab-metricHead, .lab-panelHead, .lab-statusRow, .lab-dialogHead { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .lab-metricHead h2 { font-size: 14px; }
  .lab-metricHead svg, .lab-panelHead > svg { flex: none; color: var(--ds-color-accent); }
  & .lab-metricValue { margin-top: 8px; font-size: 29px; font-weight: 700; letter-spacing: -0.03em; }
  & .lab-metricNote { display: flex; align-items: center; gap: 4px; margin-top: 4px; color: var(--ds-color-accent-ink); font-size: 12px; }
  .lab-analytics { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr); gap: 14px; }
  .lab-panelHead p { margin-top: 3px; font-size: 12px; }
  .lab-bars { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); align-items: end; gap: 6px; min-height: 150px; margin-top: 6px; padding: 0 3px; }
  .lab-day { display: grid; justify-items: center; gap: 5px; color: var(--ds-color-text-muted); font-size: 11px; }
  .lab-bar { width: min(72%, 45px); border-radius: 5px 5px 2px 2px; background: var(--ds-color-accent-soft); }
  .lab-day:last-child .lab-bar { background: var(--ds-color-accent); }
  .lab-breakdown { list-style: none; margin: 11px 0 0; padding: 0; }
  .lab-statusRow { min-height: 35px; border-bottom: 1px solid var(--ds-color-divider); }
  .lab-statusRow:last-child { border: 0; }
  .lab-badge { display: inline-flex; width: fit-content; align-items: center; gap: 5px; padding: 3px 7px; border: 0; border-radius: 999px; color: #354139; background: #edf1ef; font-size: 11px; font-weight: 700; white-space: nowrap; }
  .lab-badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .lab-badge[data-status="completed"] { color: #1c6349; background: #e4f3eb; }
  .lab-badge[data-status="running"] { color: #235a9c; background: #e8f1fc; }
  .lab-badge[data-status="failed"] { color: #913f3d; background: #fcecea; }
  .lab-results { scroll-margin-top: 12px; }
  .lab-filters { display: flex; flex-wrap: wrap; gap: 8px; }
  .lab-search { display: flex; align-items: center; gap: 6px; padding: 0 8px; color: var(--ds-color-text-muted); }
  .lab-search input { width: 132px; border: 0; background: transparent; color: var(--ds-color-text); }
  .lab-tableWrap { margin-top: 10px; overflow: auto; }
  .lab-table { width: 100%; min-width: 605px; border-collapse: collapse; text-align: left; }
  .lab-table th, .lab-table td { padding: 9px 8px; border-bottom: 1px solid var(--ds-color-divider); white-space: nowrap; }
  .lab-table thead { color: var(--ds-color-text-muted); font-size: 11px; }
  .lab-table tbody tr:last-child > * { border: 0; }
  .lab-job { display: flex; align-items: center; gap: 8px; }
  .lab-job small { display: block; margin-top: 3px; color: var(--ds-color-text-muted); font-size: 10px; font-weight: 400; }
  .lab-jobIcon { display: grid; width: 30px; height: 30px; flex: none; place-items: center; border-radius: 7px; background: var(--ds-color-accent-soft); color: var(--ds-color-accent-ink); }
  .lab-action { display: inline-grid; width: 31px; height: 31px; place-items: center; padding: 0; border: 0; border-radius: 7px; background: var(--ds-color-accent); color: var(--ds-color-on-accent); }
  .lab-action:hover { background: var(--ds-color-accent-ink); }
  .lab-empty { color: var(--ds-color-text-muted); text-align: center; }
  .lab-dialog { position: fixed; width: min(435px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); margin: auto; padding: 22px; border: 1px solid var(--ds-color-control-border); border-radius: var(--ds-radius-card); background: var(--ds-color-surface); color: var(--ds-color-text); font-family: var(--ds-font-body); }
  .lab-dialog::backdrop { background: #17272280; }
  .lab-dialogHead h2 { margin-top: 4px; font-size: 25px; }
  .lab-detail { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 15px 0 0; }
  .lab-detail dt { color: var(--ds-color-text-muted); font-size: 12px; }
  .lab-detail dd { margin: 3px 0 0; font-weight: 700; }
  .lab-footer { color: var(--ds-color-text-muted); font-size: 11px; text-align: right; }
  @media (max-width: 980px) {
    & { grid-template-columns: 174px minmax(0, 1fr); }
    .lab-topbar, .lab-content { padding-inline: 20px; }
    .lab-card { padding-inline: 14px; }
  }
  @media (max-width: 760px) {
    & { display: block; }
    .lab-sidebar { gap: 8px; padding: 10px 14px; border-right: 0; border-bottom: 1px solid var(--ds-color-border); }
    .lab-nav { display: flex; flex-wrap: wrap; }
    .lab-nav a, .lab-back { min-height: 31px; }
    .lab-topbar, .lab-content { padding-inline: 14px; }
    .lab-content { padding-top: 20px; }
    .lab-results > .lab-panelHead { flex-wrap: wrap; }
  }
  @media (max-width: 550px) {
    .lab-metrics, .lab-analytics { grid-template-columns: 1fr; }
    .lab-intro, .lab-topbar { align-items: start; flex-direction: column; }
    .lab-intro { margin-bottom: 0; }
  }
  :focus-visible { outline-color: var(--ds-color-accent); }
`
