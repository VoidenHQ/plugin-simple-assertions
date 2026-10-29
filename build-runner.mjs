#!/usr/bin/env node
import { build } from 'esbuild'
import { existsSync, readFileSync } from 'fs'

const manifest = JSON.parse(readFileSync('./manifest.json', 'utf8'))
const pluginId = manifest.id
const entry = './src/runner.ts'

if (!existsSync(entry)) {
  console.log('No runner.ts — skipping')
  process.exit(0)
}

await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // jsonc-parser's default `main` is a UMD build with dynamic require()s
  // esbuild can't follow; its ESM `module` build bundles cleanly.
  mainFields: ['module', 'main'],
  outfile: `dist/${pluginId}-runner.js`,
  external: [
    'node:*','fs','path','os','http','https','net','crypto',
    'child_process','worker_threads','stream','events','util',
    'url','buffer','readline','tty','assert','zlib',
    // Only @voiden/sdk/runner stays external (type-only here). @voiden/sdk/shared
    // (parseCookies) must be bundled: the runner is loaded from
    // ~/.voiden/extensions/, where no @voiden/sdk package resolves, so an
    // external require failed and every headless assertion was skipped.
    '@voiden/executors','@voiden/sdk/runner','electron',
  ],
  minify: true,
})
console.log(`Built dist/${pluginId}-runner.js`)
