#!/usr/bin/env node
// ── Capgo OTA release ─────────────────────────────────────────────────────────
// Ships the web bundle (dist/) to phones that already have Plaster installed.
// No App Review: Capgo downloads it on next app open and applies it the launch
// after. Native code is NOT included — a new plugin or an Xcode-side change
// still needs a real App Store build.
//
//   npm run ota:dry     rehearse: preflight + tests + build, print the command
//   npm run ota         the real thing (asks before it publishes)
//
// Flags: --allow-dirty  --skip-tests  --channel <name>  --bundle <x.y.z>
//        --level <patch|minor|major>  --comment "<text>"  --yes  --dry-run
//
// ── Versioning ────────────────────────────────────────────────────────────────
// package.json's version is the source of truth, and this script bumps it. That
// is not bookkeeping for its own sake: vite.config.ts bakes the version into the
// bundle as __APP_VERSION__, which is what Settings → About displays. So the
// version has to be decided BEFORE the build, which is why this does the bump
// itself instead of leaning on Capgo's --auto-bump (that resolves server-side,
// after the bundle is already built, and would leave the UI showing the old
// number forever).
//
// Capgo refuses a duplicate version, so if package.json ever falls behind the
// channel the upload fails loudly rather than shipping a wrong number — pass
// --bundle to set it straight. A failed run restores package.json.

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const APP_ID = 'com.plaster.the.wall.app'
const PKG = join(ROOT, 'package.json')

const argv = process.argv.slice(2)
const has = (n) => argv.includes(`--${n}`)
const opt = (n, fb) => {
  const i = argv.indexOf(`--${n}`)
  const v = i !== -1 ? argv[i + 1] : undefined
  return v && !v.startsWith('--') ? v : fb
}

if (has('help') || has('h')) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n')
    .filter((l) => l.startsWith('//')).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
  process.exit(0)
}

const DRY = has('dry-run')
const CHANNEL = opt('channel', 'production')
const LEVEL = opt('level', 'patch')
const EXPLICIT = opt('bundle', '')

// package.json is rewritten before the build; put it back if anything fails.
let restore = null
const die = (msg) => {
  if (restore) { writeFileSync(PKG, restore, 'utf8'); console.error('\n  (package.json version restored)') }
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}
const git = (...a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim() } catch { return '' } }
function step(label, cmd, args) {
  console.log(`\n── ${label} ─────────────────────────────`)
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: false })
  if (r.status !== 0) die(`${label} failed — nothing was published.`)
}
function bump(v, level) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v)
  if (!m) die(`package.json version "${v}" is not a plain x.y.z — pass --bundle <version>.`)
  let [maj, min, pat] = m.slice(1).map(Number)
  if (level === 'major') { maj++; min = 0; pat = 0 }
  else if (level === 'minor') { min++; pat = 0 }
  else if (level === 'patch' || level === 'fix') { pat++ }
  else die(`Unknown --level "${level}" (use patch, minor or major).`)
  return `${maj}.${min}.${pat}`
}

// ── 1. credentials ───────────────────────────────────────────────────────────
// Passed to the CLI through the environment, never argv: argv is readable by any
// other process on this machine via ps.
let key = (process.env.CAPGO_API_KEY || process.env.CAPGO_TOKEN || '').trim()
let keySource = key ? 'environment' : ''
if (!key) {
  const f = join(ROOT, '.capgo-key')
  if (existsSync(f)) { key = readFileSync(f, 'utf8').trim(); keySource = '.capgo-key' }
}
if (!key) die('No Capgo API key. Put it in ~/plaster/.capgo-key (gitignored) or export CAPGO_API_KEY.')

// ── 2. preflight ─────────────────────────────────────────────────────────────
const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
const dirty = git('status', '--porcelain')
const sha = git('rev-parse', '--short', 'HEAD')
const subject = git('log', '-1', '--pretty=%s')

const pkgRaw = readFileSync(PKG, 'utf8')
const current = JSON.parse(pkgRaw).version
if (current === '0.0.0' && !EXPLICIT) die('package.json is still 0.0.0 — Capgo needs a real version. Pass --bundle <x.y.z> once to seed it.')
const target = EXPLICIT || bump(current, LEVEL)
const native = readFileSync(join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')
  .match(/MARKETING_VERSION = ([^;]+);/)?.[1]?.trim()

console.log(`
Capgo OTA — ${APP_ID}
  channel        ${CHANNEL}
  version        ${current} → ${target}${EXPLICIT ? ' (explicit)' : ` (${LEVEL})`}
  commit         ${sha} ${subject}
  branch         ${branch}
  api key        ${keySource}
  iOS native     ${native ?? '?'}`)

if (dirty && !has('allow-dirty')) {
  die(`Working tree is dirty — commit first, or pass --allow-dirty.\n\n${dirty}`)
}
if (branch !== 'main') console.log(`\n⚠  On "${branch}", not main. OTA goes to real phones from whatever is built here.`)

// ── 3. gates ─────────────────────────────────────────────────────────────────
if (!has('skip-tests')) step('Tests', 'npm', ['test'])

// Bump before building: Vite bakes this into the bundle as __APP_VERSION__, so
// Settings → About reports the version people are actually running.
restore = pkgRaw
writeFileSync(PKG, pkgRaw.replace(`"version": "${current}"`, `"version": "${target}"`), 'utf8')
if (JSON.parse(readFileSync(PKG, 'utf8')).version !== target) die(`Could not set the version to ${target} in package.json.`)
console.log(`\n  package.json version → ${target}`)

step('Build', 'npm', ['run', 'build'])
if (!existsSync(join(ROOT, 'dist/index.html'))) die('dist/index.html missing after build.')
// Prove the version actually reached the bundle, rather than trusting the wiring.
let baked = ''
try { baked = execFileSync('grep', ['-rl', target, join(ROOT, 'dist/assets')], { encoding: 'utf8' }).trim() } catch { /* grep exits 1 on no match */ }
if (!baked) die(`Built bundle has no "${target}" in it — the __APP_VERSION__ wiring in vite.config.ts is broken, so Settings would show the wrong version.`)
console.log(`  version baked into ${baked.split('\n').length} bundle file(s)`)

// ── 4. publish ───────────────────────────────────────────────────────────────
const comment = opt('comment', `${sha} ${subject}`)
const args = ['-y', '@capgo/cli@latest', 'bundle', 'upload', APP_ID,
  '--channel', CHANNEL,
  '--bundle', target,
  '--auto-min-update-version',
  '--comment', comment]

const shown = args.slice(1).map((a) => (/[\s"']/.test(a) ? JSON.stringify(a) : a)).join(' ')
console.log(`\n── Publish ─────────────────────────────`)
console.log(`  CAPGO_API_KEY=<from ${keySource}> npx ${shown}`)

if (DRY) {
  writeFileSync(PKG, pkgRaw, 'utf8')
  console.log(`\n✓ Dry run — tests and build passed, version ${target} verified in the bundle, nothing uploaded.`)
  console.log('  package.json restored. Run `npm run ota` to publish for real.\n')
  process.exit(0)
}

if (!has('yes')) {
  if (!process.stdin.isTTY) die('Refusing to publish without a human: re-run in a terminal, or pass --yes.')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const a = await rl.question(`\nThis pushes v${target} to every installed copy of Plaster on the "${CHANNEL}" channel. Type the channel name to confirm: `)
  rl.close()
  if (a.trim() !== CHANNEL) die('Not confirmed — nothing was published.')
}

const r = spawnSync('npx', args, {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, CAPGO_API_KEY: key, CAPGO_DISABLE_TELEMETRY: '1' },
})
if (r.status !== 0) die('Upload failed — nothing was published.')
restore = null
console.log(`\n✓ Published v${target} to "${CHANNEL}". Phones pick it up on next open and apply it the launch after.`)
console.log(`  Commit the version bump:  git commit -am "Release v${target}"\n`)
