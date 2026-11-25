import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { chromium } from '@playwright/test'
import { preview } from 'vite'

const variants = ['css-modules', 'styled-components', 'tailwind', 'shadcn']
const switchTargets = [
  { brand: 'signal', font: 'Verdana, sans-serif', color: 'rgb(68, 69, 180)' },
  { brand: 'grove', font: 'Georgia, serif', color: 'rgb(24, 102, 73)' },
]
const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'))
const output = 'test-results'
await mkdir(output, { recursive: true })

async function bundleSizes(entry) {
  const visited = new Set()
  const js = new Set()
  const css = new Set()

  function visit(key) {
    if (visited.has(key)) return
    visited.add(key)
    const chunk = manifest[key]
    if (!chunk) throw new Error(`Missing manifest entry: ${key}`)
    if (chunk.file.endsWith('.js')) js.add(chunk.file)
    if (chunk.file.endsWith('.css')) css.add(chunk.file)
    for (const style of chunk.css ?? []) css.add(style)
    for (const dependency of chunk.imports ?? []) visit(dependency)
  }

  async function gzipBytes(files) {
    const sizes = await Promise.all([...files].map(async (file) => gzipSync(await readFile(join('dist', file))).length))
    return sizes.reduce((total, size) => total + size, 0)
  }

  visit(entry)
  return { jsGzipBytes: await gzipBytes(js), cssGzipBytes: await gzipBytes(css) }
}

function percentile(samples, fraction) {
  const sorted = [...samples].sort((a, b) => a - b)
  return Math.round(sorted[Math.ceil(sorted.length * fraction) - 1] * 100) / 100
}

async function switches(page) {
  const samples = []
  for (let i = 0; i < 22; i++) {
    const target = switchTargets[i % switchTargets.length]
    const sample = await page.evaluate(async ({ brand, color, font }) => {
      const input = document.querySelector('[aria-label="Operations theme"] select')
      const root = document.querySelector('[data-brand]')
      const heading = root?.querySelector('h1')
      const action = root?.querySelector('table button')
      if (!input || !root || !heading || !action) throw new Error('Theme controls are unavailable')
      // Start just after a frame callback so elapsed values include frame scheduling.
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const start = performance.now()
      input.value = `${brand}-operator`
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await new Promise((resolve) => requestAnimationFrame(resolve))
      if (root.dataset.brand !== brand) throw new Error(`Theme did not update to ${brand}`)
      const stateMs = performance.now() - start
      while (getComputedStyle(heading).fontFamily !== font || getComputedStyle(action).backgroundColor !== color) {
        if (performance.now() - start > 750) {
          throw new Error(`Theme styles did not settle for ${brand}: ${getComputedStyle(action).backgroundColor}`)
        }
        await new Promise((resolve) => requestAnimationFrame(resolve))
      }
      return { stateMs, styleMs: performance.now() - start }
    }, target)
    if (i >= 2) samples.push(sample)
  }
  return samples
}

async function inspectStyleRules(page) {
  const snapshots = []
  const account = page.getByLabel('Demo account')
  const root = page.getByRole('region', { name: 'Operations theme' })
  for (const brand of ['grove', 'signal', 'ember', 'grove']) {
    await account.selectOption(`${brand}-operator`)
    if (await root.getAttribute('data-brand') !== brand) throw new Error(`Brand selection failed: ${brand}`)
    snapshots.push(await page.evaluate((brand) => {
      const sheets = [...document.styleSheets]
      const count = (filtered) => filtered.reduce((sum, sheet) => sum + sheet.cssRules.length, 0)
      const inline = sheets.filter((sheet) => sheet.ownerNode instanceof HTMLStyleElement)
      const styled = inline.filter((sheet) => sheet.ownerNode.hasAttribute('data-styled'))
      const scope = document.querySelector('[data-brand]')
      return {
        brand, linkedRules: count(sheets.filter((sheet) => sheet.ownerNode instanceof HTMLLinkElement)),
        inlineRules: count(inline), styledRules: count(styled),
        scopedBrandVariables: [...scope.style].filter((name) => name.startsWith('--brand-')).length,
      }
    }, brand))
  }
  return snapshots
}

const app = await preview({ preview: { host: '127.0.0.1', port: 4183, strictPort: true } })
try {
  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    const results = []
    for (const variant of variants) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
      try {
        const page = await context.newPage()
        const entry = `experiments/brand-theme/${variant}/index.html`
        await page.goto(`http://127.0.0.1:4183/experiments/brand-theme/${variant}/`)
        await page.getByRole('heading', { name: 'Operations overview' }).waitFor()
        const ruleSnapshots = await inspectStyleRules(page)
        const samples = await switches(page)
        await page.screenshot({ path: join(output, `theme-${variant}.png`), fullPage: true })
        results.push({
          variant, ...await bundleSizes(entry),
          stateMedianMs: percentile(samples.map(({ stateMs }) => stateMs), 0.5),
          stateP95Ms: percentile(samples.map(({ stateMs }) => stateMs), 0.95),
          styleMedianMs: percentile(samples.map(({ styleMs }) => styleMs), 0.5),
          styleP95Ms: percentile(samples.map(({ styleMs }) => styleMs), 0.95),
          transition: await page.locator('table button').first().evaluate((button) => {
            const style = getComputedStyle(button)
            return { property: style.transitionProperty, duration: style.transitionDuration }
          }),
          ruleSnapshots, samples,
        })
      } finally {
        await context.close()
      }
    }
    await writeFile(join(output, 'theme-benchmark.json'), JSON.stringify({ chrome: browser.version(), variants: results }, null, 2))
    console.table(results.map(({ samples, transition, ruleSnapshots, ...row }) => ({ ...row, transition: transition.duration, samples: samples.length })))
    console.log(`Chrome ${browser.version()}`)
  } finally {
    await browser.close()
  }
} finally {
  await new Promise((resolve, reject) => app.httpServer.close((error) => error ? reject(error) : resolve()))
}
