import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

const repo = fileURLToPath(new URL('..', import.meta.url))
const lab = 'experiments/brand-theme'
const watch = process.argv.includes('--watch')
const tokensFile = 'shared/design-system/tokens.ts'
const brandFile = 'shared/design-system/brands.ts'
const themeFile = 'shared/design-system/theme.ts'
const fallbackColor = 'rgb(217, 226, 221)'
const brands = [
  { name: 'grove', hex: '#438361', rgb: 'rgb(67, 131, 97)' },
  { name: 'signal', hex: '#7770bc', rgb: 'rgb(119, 112, 188)' },
  { name: 'ember', hex: '#ac6249', rgb: 'rgb(172, 98, 73)' },
]

const tailwindEdits = [
  ['tailwind/tokens.css', '  --color-brand-ink: var(--ds-color-accent-ink);', '  --color-brand-ink: var(--ds-color-accent-ink);\n  --color-brand-outline: var(--ds-color-dialog-outline);'],
  ['tailwind/classes.ts', 'border border-control bg-surface p-[22px]', 'border border-brand-outline bg-surface p-[22px]'],
]
const variants = [
  ['css-modules', [['css-modules/dashboard.module.css', 'padding: 22px; border: 1px solid var(--ds-color-control-border);', 'padding: 22px; border: 1px solid var(--ds-color-dialog-outline);']]],
  ['styled-components', [['styled-components/Region.ts', 'padding: 22px; border: 1px solid ${({ theme }) => theme.color.controlBorder};', 'padding: 22px; border: 1px solid ${({ theme }) => theme.color.dialogOutline};']]],
  ['tailwind', tailwindEdits],
  ['shadcn', tailwindEdits],
]

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error(`Expected one match for ${before}`)
  return source.replace(before, after)
}

async function applyEdits(root, edits, originals) {
  for (const [relative, before, after] of edits) {
    const path = join(root, lab, relative)
    const source = await readFile(path, 'utf8')
    if (!originals.has(path)) originals.set(path, source)
    await writeFile(path, replaceOnce(source, before, after))
  }
}

async function openAndCheck(page, expectedColor) {
  await page.getByRole('button', { name: 'View Atlas import' }).click()
  const dialog = page.getByRole('dialog', { name: 'Atlas import' })
  await expect(dialog).toHaveCSS('border-top-color', expectedColor)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
}

async function measure(root, browser, variant, edits, round) {
  const server = await createServer({
    root,
    cacheDir: join(root, '.vite-cache'),
    configFile: join(root, 'vite.config.ts'),
    server: { host: '127.0.0.1', port: 0, open: false, hmr: watch },
  })
  const originals = new Map()
  let context
  try {
    await server.listen()
    const address = server.httpServer.address()
    const url = `http://127.0.0.1:${address.port}/${lab}/${variant}/`
    context = await browser.newContext()
    const page = await context.newPage()
    if (watch) return await measureBrandEdit(root, page, url, variant, round, originals)
    await page.goto(url)
    await openAndCheck(page, fallbackColor)

    const start = performance.now()
    await applyEdits(root, edits, originals)
    const patchMs = performance.now() - start
    await server.restart()
    await page.reload()
    const account = page.getByLabel('Demo account')
    await account.selectOption('grove-operator')
    await openAndCheck(page, brands[0].rgb)
    const firstMs = performance.now() - start
    for (const brand of brands.slice(1)) {
      await account.selectOption(`${brand.name}-operator`)
      await openAndCheck(page, brand.rgb)
    }
    // Sign-out uses the effective env default. With no .env files in this copy,
    // account-less state is Grove unless the caller provided VITE_DEFAULT_BRAND.
    await account.selectOption('')
    await openAndCheck(page, brands.find(({ name }) => name === process.env.VITE_DEFAULT_BRAND)?.rgb ?? brands[0].rgb)
    return {
      variant, round, variantFiles: originals.size, variantEdits: edits.length,
      patchMs: Math.round(patchMs), firstMs: Math.round(firstMs), allMs: Math.round(performance.now() - start),
    }
  } finally {
    await context?.close()
    await server.close()
    for (const [path, source] of originals) await writeFile(path, source)
  }
}

async function measureBrandEdit(root, page, url, variant, round, originals) {
  const connected = page.waitForEvent('console', {
    predicate: (message) => message.text() === '[vite] connected.',
    timeout: 10_000,
  })
  await Promise.all([page.goto(url), connected])
  await page.getByLabel('Demo account').selectOption('grove-operator')
  const button = page.getByRole('button', { name: 'View Atlas import' })
  await expect(button).toHaveCSS('background-color', 'rgb(24, 102, 73)')

  let reloads = 0
  let duplicateRootWarnings = 0
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) reloads++ })
  page.on('console', (message) => {
    if (message.text().includes('already been passed to createRoot()')) duplicateRootWarnings++
  })
  const start = performance.now()
  await applyEdits(root, [[tokensFile, '#186649', '#315c8e']], originals)
  await page.waitForFunction((color) => {
    const button = document.querySelector('button[aria-label="View Atlas import"]')
    return button && getComputedStyle(button).backgroundColor === color
  }, 'rgb(49, 92, 142)', { timeout: 10_000 })
  const visibleMs = Math.round(performance.now() - start)
  // Fast Refresh can show the new style just before invalidating the module and reloading.
  await delay(500)
  await expect(button).toHaveCSS('background-color', 'rgb(49, 92, 142)')
  return { variant, round, visibleMs, reloads, duplicateRootWarnings }
}

const root = await mkdtemp(join(tmpdir(), 'playground-theme-change-'))
try {
  for (const path of ['experiments', 'package.json', 'tsconfig.json', 'vite.config.ts', 'index.html']) {
    await cp(join(repo, path), join(root, path), { recursive: true })
  }
  await symlink(join(repo, 'node_modules'), join(root, 'node_modules'), 'junction')

  const [grove, signal, ember] = brands
  const commonEdits = [
    [tokensFile, "    controlBorder: '#d9e2dd',", "    controlBorder: '#d9e2dd',\n    dialogOutline: '#d9e2dd',"],
    [brandFile, "| 'accentInk'>", "| 'accentInk' | 'dialogOutline'>"],
    [brandFile, 'overrides: {}', `overrides: { color: { dialogOutline: '${grove.hex}' } }`],
    [brandFile, "page: '#edf0ff',", `page: '#edf0ff', dialogOutline: '${signal.hex}',`],
    [brandFile, "page: '#fff1e8',", `page: '#fff1e8', dialogOutline: '${ember.hex}',`],
    [themeFile, "    '--ds-color-control-border': tokens.color.controlBorder,", "    '--ds-color-control-border': tokens.color.controlBorder,\n    '--ds-color-dialog-outline': tokens.color.dialogOutline,"],
  ]
  if (!watch) await applyEdits(root, commonEdits, new Map())

  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    const samples = []
    for (let round = 0; round < 3; round++) {
      for (const [variant, edits] of [...variants.slice(round), ...variants.slice(0, round)]) {
        samples.push(await measure(root, browser, variant, edits, round + 1))
      }
    }
    const output = join(repo, 'test-results', watch ? 'theme-dev-edit.json' : 'theme-change.json')
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, JSON.stringify({
      chrome: browser.version(), sharedFiles: watch ? 1 : new Set(commonEdits.map(([path]) => path)).size,
      sharedEdits: watch ? 1 : commonEdits.length, samples,
    }, null, 2))
    console.table(samples)
  } finally {
    await browser.close()
  }
} finally {
  if (dirname(root) === tmpdir()) await rm(root, { recursive: true, force: true })
}
