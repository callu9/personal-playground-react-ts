import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { cpus } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(import.meta.url)
const root = dirname(dirname(script))
const variants = ['css-modules', 'styled-components', 'tailwind', 'shadcn']

if (process.argv[2]) {
  const variant = process.argv[2]
  if (!variants.includes(variant)) throw new Error(`Unknown candidate: ${variant}`)

  const { build, loadConfigFromFile } = await import('vite')
  const start = performance.now()
  const loaded = await loadConfigFromFile(
    { command: 'build', mode: 'production' }, join(root, 'vite.config.ts'), root, 'silent',
  )
  if (!loaded) throw new Error('Vite configuration is missing')
  const config = loaded.config
  const entry = `experiments/brand-theme/${variant}/index.html`
  const result = await build({
    ...config,
    root,
    configFile: false,
    logLevel: 'silent',
    build: {
      ...config.build,
      write: false,
      rolldownOptions: { ...config.build?.rolldownOptions, input: join(root, entry) },
    },
  })
  const duration = Math.round(performance.now() - start)
  const outputs = Array.isArray(result) ? result : [result]
  const html = outputs.flatMap(({ output }) => output.map(({ fileName }) => fileName)).filter((name) => name.endsWith('.html'))
  if (html.length !== 1 || html[0] !== entry) throw new Error(`Unexpected HTML output: ${html}`)
  console.log(JSON.stringify({ viteMs: duration }))
} else {
  function measure(variant) {
    const start = performance.now()
    const child = execFileSync(process.execPath, [script, variant], { cwd: root, encoding: 'utf8' })
    return { processMs: Math.round(performance.now() - start), ...JSON.parse(child.trim()) }
  }

  function median(values) {
    return values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
  }

  for (const variant of variants) measure(variant)
  const samples = []
  for (let round = 0; round < 7; round++) {
    const offset = round % variants.length
    for (const variant of [...variants.slice(offset), ...variants.slice(0, offset)]) {
      samples.push({ variant, round: round + 1, ...measure(variant) })
    }
  }
  const summary = variants.map((variant) => {
    const runs = samples.filter((sample) => sample.variant === variant)
    const vite = runs.map(({ viteMs }) => viteMs)
    const process = runs.map(({ processMs }) => processMs)
    return {
      variant, viteMedianMs: median(vite), viteMinMs: Math.min(...vite), viteMaxMs: Math.max(...vite),
      processMedianMs: median(process),
    }
  })

  const output = join(root, 'test-results/theme-build.json')
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify({ node: process.version, platform: process.platform, cpu: cpus()[0]?.model, summary, samples }, null, 2))
  console.table(summary)
}
