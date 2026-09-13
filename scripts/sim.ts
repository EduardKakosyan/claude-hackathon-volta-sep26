#!/usr/bin/env tsx
/**
 * pnpm sim <command> — the agent's local eyes and hands on Mobile Safari.
 *
 * Playwright WebKit cannot fake Safari's collapsing URL bar, the home-indicator
 * safe areas, the native geolocation alert, or iOS gesture recognisers. This
 * script wraps `xcrun simctl` (boot, screenshot, location, open URL) and Meta's
 * `idb` (tap, swipe, rotate, accessibility tree) so each primitive is one
 * command whose output the agent can read. Nothing here runs in CI; see
 * docs/sim.md for the two local installs.
 *
 *   boot [device]                 boot, wait, open http://localhost:3000 in Safari
 *   prod [device]                 same, against https://www.nsbeaches.ca
 *   shot <name>                   PNG → test-results/sim/<name>.png
 *   tap <x> <y>                   idb ui tap
 *   swipe <x1> <y1> <x2> <y2> [ms]  idb ui swipe (duration in ms, default 250)
 *   rotate <portrait|landscape>   idb ui rotate
 *   describe                      idb ui describe-all → accessibility tree with frames
 *   locate <lat>,<lon>            simctl location set
 *   doctor                        checks xcrun, idb_companion, idb and the device
 *
 * Every subprocess goes through one injected `run`, so scripts/sim.test.ts
 * covers the argv mapping without touching a simulator.
 */
import { spawn } from 'node:child_process'
import { mkdir as fsMkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const DEFAULT_DEVICE = 'iPhone 16'
export const DEV_URL = 'http://localhost:3000'
export const PROD_URL = 'https://www.nsbeaches.ca'
export const SHOT_DIR = join('test-results', 'sim')
export const DEFAULT_SWIPE_MS = 250

export type Orientation = 'portrait' | 'landscape'

/** idb's orientation vocabulary; landscape is "home indicator on the right". */
const IDB_ORIENTATION: Record<Orientation, string> = {
  portrait: 'PORTRAIT',
  landscape: 'LANDSCAPE_RIGHT',
}

export type Command =
  | { kind: 'boot'; device: string; url: string }
  | { kind: 'shot'; name: string }
  | { kind: 'tap'; x: number; y: number }
  | { kind: 'swipe'; x1: number; y1: number; x2: number; y2: number; ms: number }
  | { kind: 'rotate'; orientation: Orientation }
  | { kind: 'describe' }
  | { kind: 'locate'; lat: number; lon: number }
  | { kind: 'doctor' }

export interface RunResult {
  /** Exit code; 127 when the binary is not on PATH. */
  code: number
  stdout: string
  stderr: string
}

export type Run = (cmd: string, args: string[]) => Promise<RunResult>

export interface Deps {
  run: Run
  log: (line: string) => void
  mkdir: (dir: string) => Promise<void>
}

export class UsageError extends Error {}

export const USAGE = `usage: pnpm sim <command>

  boot [device]                    boot the simulator and open ${DEV_URL}
  prod [device]                    boot the simulator and open ${PROD_URL}
  shot <name>                      screenshot → ${SHOT_DIR}/<name>.png
  tap <x> <y>                      tap a point
  swipe <x1> <y1> <x2> <y2> [ms]   swipe between two points (default ${DEFAULT_SWIPE_MS} ms)
  rotate <portrait|landscape>      rotate the device
  describe                         print the accessibility tree with coordinates
  locate <lat>,<lon>               set the simulated location
  doctor                           check the toolchain

device defaults to "${DEFAULT_DEVICE}".`

// ---------------------------------------------------------------------------
// Argument parsing (pure)
// ---------------------------------------------------------------------------

function number(raw: string | undefined, label: string): number {
  if (raw === undefined) throw new UsageError(`missing ${label}`)
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new UsageError(`${label} must be a number, got "${raw}"`)
  return value
}

function exactly(rest: string[], count: number, command: string): void {
  if (rest.length !== count) {
    throw new UsageError(`${command} takes ${count} argument${count === 1 ? '' : 's'}, got ${rest.length}`)
  }
}

export function parseArgs(argv: string[]): Command {
  const [command, ...rest] = argv
  switch (command) {
    case 'boot':
    case 'prod': {
      if (rest.length > 1) throw new UsageError(`${command} takes at most one argument (device)`)
      return {
        kind: 'boot',
        device: rest[0] ?? DEFAULT_DEVICE,
        url: command === 'prod' ? PROD_URL : DEV_URL,
      }
    }
    case 'shot': {
      exactly(rest, 1, 'shot')
      const name = rest[0]
      if (!/^[\w.-]+$/.test(name)) {
        throw new UsageError(`shot name must be letters, digits, dot, dash or underscore, got "${name}"`)
      }
      return { kind: 'shot', name }
    }
    case 'tap': {
      exactly(rest, 2, 'tap')
      return { kind: 'tap', x: number(rest[0], 'x'), y: number(rest[1], 'y') }
    }
    case 'swipe': {
      if (rest.length < 4 || rest.length > 5) {
        throw new UsageError(`swipe takes x1 y1 x2 y2 [ms], got ${rest.length} arguments`)
      }
      return {
        kind: 'swipe',
        x1: number(rest[0], 'x1'),
        y1: number(rest[1], 'y1'),
        x2: number(rest[2], 'x2'),
        y2: number(rest[3], 'y2'),
        ms: rest[4] === undefined ? DEFAULT_SWIPE_MS : number(rest[4], 'ms'),
      }
    }
    case 'rotate': {
      exactly(rest, 1, 'rotate')
      const orientation = rest[0]
      if (orientation !== 'portrait' && orientation !== 'landscape') {
        throw new UsageError(`rotate takes portrait or landscape, got "${orientation}"`)
      }
      return { kind: 'rotate', orientation }
    }
    case 'describe':
      exactly(rest, 0, 'describe')
      return { kind: 'describe' }
    case 'locate': {
      exactly(rest, 1, 'locate')
      const match = /^(-?[\d.]+),(-?[\d.]+)$/.exec(rest[0])
      if (!match) throw new UsageError(`locate takes <lat>,<lon>, got "${rest[0]}"`)
      return { kind: 'locate', lat: number(match[1], 'lat'), lon: number(match[2], 'lon') }
    }
    case 'doctor':
      exactly(rest, 0, 'doctor')
      return { kind: 'doctor' }
    case undefined:
    case '-h':
    case '--help':
    case 'help':
      throw new UsageError(USAGE)
    default:
      throw new UsageError(`unknown command "${command}"\n\n${USAGE}`)
  }
}

// ---------------------------------------------------------------------------
// Device lookup (pure over `simctl list devices -j`)
// ---------------------------------------------------------------------------

export interface SimDevice {
  name: string
  udid: string
  state: string
  isAvailable?: boolean
}

interface SimctlList {
  devices: Record<string, SimDevice[]>
}

export function listedDevices(json: string): SimDevice[] {
  const parsed = JSON.parse(json) as SimctlList
  return Object.values(parsed.devices ?? {})
    .flat()
    .filter((device) => device.isAvailable !== false)
}

/** The simulator with this exact name, or `undefined`. */
export function findDevice(json: string, name: string): SimDevice | undefined {
  return listedDevices(json).find((device) => device.name === name)
}

/** The first booted simulator, or `undefined`. */
export function findBooted(json: string): SimDevice | undefined {
  return listedDevices(json).find((device) => device.state === 'Booted')
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

function describeFailure(cmd: string, args: string[], result: RunResult): string {
  const detail = (result.stderr || result.stdout).trim()
  return `${cmd} ${args.join(' ')} exited ${result.code}${detail ? `\n${detail}` : ''}`
}

async function must(deps: Deps, cmd: string, args: string[]): Promise<RunResult> {
  const result = await deps.run(cmd, args)
  if (result.code !== 0) throw new Error(describeFailure(cmd, args, result))
  return result
}

const simctl = (deps: Deps, ...args: string[]) => must(deps, 'xcrun', ['simctl', ...args])

async function devicesJson(deps: Deps): Promise<string> {
  return (await simctl(deps, 'list', 'devices', '-j')).stdout
}

async function bootedUdid(deps: Deps): Promise<string> {
  const booted = findBooted(await devicesJson(deps))
  if (!booted) throw new Error('no simulator is booted; run `pnpm sim boot` first')
  return booted.udid
}

const idb = async (deps: Deps, ...args: string[]) =>
  must(deps, 'idb', [...args, '--udid', await bootedUdid(deps)])

async function boot(deps: Deps, device: string, url: string): Promise<void> {
  const json = await devicesJson(deps)
  const target = findDevice(json, device)
  if (!target) {
    const names = [...new Set(listedDevices(json).map((entry) => entry.name))].sort()
    throw new Error(`no simulator named "${device}"; available: ${names.join(', ')}`)
  }
  // bootstatus -b boots when needed and blocks until SpringBoard is up.
  await simctl(deps, 'bootstatus', target.udid, '-b')
  // Show the window so a human can watch; screenshots work either way.
  await must(deps, 'open', ['-a', 'Simulator'])
  await simctl(deps, 'openurl', target.udid, url)
  deps.log(`${target.name} (${target.udid}) booted; Safari opened ${url}`)
}

async function shot(deps: Deps, name: string): Promise<void> {
  await deps.mkdir(SHOT_DIR)
  const file = join(SHOT_DIR, `${name}.png`)
  await simctl(deps, 'io', 'booted', 'screenshot', file)
  deps.log(file)
}

interface Check {
  label: string
  ok: boolean
  detail: string
  fix?: string
}

async function probe(deps: Deps, cmd: string, args: string[]): Promise<RunResult> {
  try {
    return await deps.run(cmd, args)
  } catch (error) {
    return { code: 127, stdout: '', stderr: error instanceof Error ? error.message : String(error) }
  }
}

export const INSTALL_HINTS = {
  xcode: 'Install Xcode from the App Store, then: sudo xcode-select -s /Applications/Xcode.app',
  companion:
    'brew tap facebook/fb && brew install idb-companion\n' +
    '  (if Homebrew refuses on the Xcode version, unpack the release tarball by hand; see docs/sim.md)',
  idb:
    'brew install python@3.12 && python3.12 -m venv ~/.local/share/fb-idb && ' +
    '~/.local/share/fb-idb/bin/pip install fb-idb && ' +
    'ln -sfn ~/.local/share/fb-idb/bin/idb /opt/homebrew/bin/idb',
  device: `Xcode > Settings > Components: install an iOS Simulator runtime that includes "${DEFAULT_DEVICE}"`,
}

async function doctor(deps: Deps): Promise<number> {
  const checks: Check[] = []

  const xcrun = await probe(deps, 'xcrun', ['simctl', 'help'])
  checks.push({
    label: 'xcrun simctl',
    ok: xcrun.code === 0,
    detail: xcrun.code === 0 ? 'ok' : xcrun.stderr.trim() || 'not found',
    fix: INSTALL_HINTS.xcode,
  })

  const companion = await probe(deps, 'idb_companion', ['--version'])
  checks.push({
    label: 'idb_companion',
    ok: companion.code === 0,
    detail: companion.code === 0 ? companion.stdout.trim() || 'ok' : companion.stderr.trim() || 'not found',
    fix: INSTALL_HINTS.companion,
  })

  const client = await probe(deps, 'idb', ['list-targets'])
  checks.push({
    label: 'idb',
    ok: client.code === 0,
    detail: client.code === 0 ? 'ok' : client.stderr.trim() || 'not found',
    fix: INSTALL_HINTS.idb,
  })

  if (xcrun.code === 0) {
    const list = await probe(deps, 'xcrun', ['simctl', 'list', 'devices', '-j'])
    const device = list.code === 0 ? findDevice(list.stdout, DEFAULT_DEVICE) : undefined
    checks.push({
      label: `${DEFAULT_DEVICE} simulator`,
      ok: device !== undefined,
      detail: device ? `${device.udid} (${device.state})` : 'not found',
      fix: INSTALL_HINTS.device,
    })
  }

  for (const check of checks) {
    deps.log(`${check.ok ? 'ok     ' : 'missing'}  ${check.label}: ${check.detail}`)
    if (!check.ok && check.fix) deps.log(`         ${check.fix}`)
  }
  return checks.every((check) => check.ok) ? 0 : 1
}

export async function execute(command: Command, deps: Deps): Promise<number> {
  switch (command.kind) {
    case 'boot':
      await boot(deps, command.device, command.url)
      return 0
    case 'shot':
      await shot(deps, command.name)
      return 0
    case 'tap':
      await idb(deps, 'ui', 'tap', String(command.x), String(command.y))
      return 0
    case 'swipe':
      await idb(
        deps,
        'ui',
        'swipe',
        '--duration',
        String(command.ms / 1000),
        String(command.x1),
        String(command.y1),
        String(command.x2),
        String(command.y2),
      )
      return 0
    case 'rotate':
      await idb(deps, 'ui', 'rotate', IDB_ORIENTATION[command.orientation])
      return 0
    case 'describe': {
      // The default backend stops at Safari's own chrome; `axbridge` walks the
      // UIKit hierarchy into the WKWebView, so page elements come back with frames.
      const result = await idb(deps, 'ui', 'describe-all', '--api', 'axbridge')
      deps.log(result.stdout.trimEnd())
      return 0
    }
    case 'locate':
      await simctl(deps, 'location', 'booted', 'set', `${command.lat},${command.lon}`)
      deps.log(`location set to ${command.lat},${command.lon}`)
      return 0
    case 'doctor':
      return doctor(deps)
  }
}

// ---------------------------------------------------------------------------
// Real subprocess runner and entry point
// ---------------------------------------------------------------------------

export function spawnRun(cmd: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (error: NodeJS.ErrnoException) => {
      resolve({
        code: 127,
        stdout,
        stderr: error.code === 'ENOENT' ? `${cmd}: command not found` : error.message,
      })
    })
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })
}

export async function main(argv: string[], deps: Deps): Promise<number> {
  let command: Command
  try {
    command = parseArgs(argv)
  } catch (error) {
    if (error instanceof UsageError) {
      deps.log(error.message)
      return 2
    }
    throw error
  }
  try {
    return await execute(command, deps)
  } catch (error) {
    deps.log(`sim ${command.kind}: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

const invokedDirectly =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  main(process.argv.slice(2), {
    run: spawnRun,
    log: (line) => console.log(line),
    mkdir: (dir) => fsMkdir(dir, { recursive: true }).then(() => undefined),
  }).then((code) => process.exit(code))
}
