import { describe, expect, it } from 'vitest'

import {
  DEFAULT_DEVICE,
  DEFAULT_SWIPE_MS,
  DEV_URL,
  PROD_URL,
  SHOT_DIR,
  UsageError,
  execute,
  findBooted,
  findDevice,
  main,
  parseArgs,
  type Deps,
  type RunResult,
} from './sim'

const UDID = '4CEC54C1-452D-4BED-81B6-1657E5EED9A4'

const devices = (state: 'Booted' | 'Shutdown') =>
  JSON.stringify({
    devices: {
      'com.apple.CoreSimulator.SimRuntime.iOS-18-5': [
        { name: 'iPad (A16)', udid: 'IPAD', state: 'Shutdown', isAvailable: true },
        { name: 'iPhone 16', udid: UDID, state, isAvailable: true },
        { name: 'iPhone 16 Pro', udid: 'PRO', state: 'Shutdown', isAvailable: true },
      ],
      'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
        { name: 'iPhone 15', udid: 'OLD', state: 'Shutdown', isAvailable: false },
      ],
    },
  })

/**
 * A fake runner: records every argv and answers from a table keyed on the
 * first few words of the command, so no test touches a simulator.
 */
function fake(answers: Record<string, Partial<RunResult>> = {}, booted: 'Booted' | 'Shutdown' = 'Booted') {
  const calls: string[][] = []
  const logs: string[] = []
  const dirs: string[] = []
  const deps: Deps = {
    run: async (cmd, args) => {
      calls.push([cmd, ...args])
      const key = [cmd, ...args].join(' ')
      if (key === 'xcrun simctl list devices -j') return { code: 0, stdout: devices(booted), stderr: '' }
      const hit = Object.entries(answers).find(([prefix]) => key.startsWith(prefix))
      return { code: 0, stdout: '', stderr: '', ...hit?.[1] }
    },
    log: (line) => logs.push(line),
    mkdir: async (dir) => {
      dirs.push(dir)
    },
  }
  return { deps, calls, logs, dirs }
}

describe('parseArgs', () => {
  it('boot defaults to the iPhone 16 and the dev server', () => {
    expect(parseArgs(['boot'])).toEqual({ kind: 'boot', device: DEFAULT_DEVICE, url: DEV_URL })
    expect(parseArgs(['boot', 'iPhone 16 Pro'])).toEqual({ kind: 'boot', device: 'iPhone 16 Pro', url: DEV_URL })
  })

  it('prod is boot against nsbeaches.ca', () => {
    expect(parseArgs(['prod'])).toEqual({ kind: 'boot', device: DEFAULT_DEVICE, url: PROD_URL })
  })

  it('shot takes one safe file name', () => {
    expect(parseArgs(['shot', 'phase2-home'])).toEqual({ kind: 'shot', name: 'phase2-home' })
    expect(() => parseArgs(['shot', '../escape'])).toThrow(UsageError)
    expect(() => parseArgs(['shot'])).toThrow(UsageError)
  })

  it('tap and swipe parse numbers; swipe duration defaults', () => {
    expect(parseArgs(['tap', '196', '500'])).toEqual({ kind: 'tap', x: 196, y: 500 })
    expect(parseArgs(['swipe', '196', '500', '196', '200'])).toEqual({
      kind: 'swipe',
      x1: 196,
      y1: 500,
      x2: 196,
      y2: 200,
      ms: DEFAULT_SWIPE_MS,
    })
    expect(parseArgs(['swipe', '1', '2', '3', '4', '600'])).toMatchObject({ ms: 600 })
    expect(() => parseArgs(['tap', 'a', '1'])).toThrow(/must be a number/)
    expect(() => parseArgs(['swipe', '1', '2', '3'])).toThrow(UsageError)
  })

  it('rotate accepts only the two orientations', () => {
    expect(parseArgs(['rotate', 'landscape'])).toEqual({ kind: 'rotate', orientation: 'landscape' })
    expect(parseArgs(['rotate', 'portrait'])).toEqual({ kind: 'rotate', orientation: 'portrait' })
    expect(() => parseArgs(['rotate', 'sideways'])).toThrow(UsageError)
  })

  it('locate takes lat,lon as one argument', () => {
    expect(parseArgs(['locate', '44.64,-63.57'])).toEqual({ kind: 'locate', lat: 44.64, lon: -63.57 })
    expect(() => parseArgs(['locate', '44.64', '-63.57'])).toThrow(UsageError)
    expect(() => parseArgs(['locate', 'halifax'])).toThrow(UsageError)
  })

  it('describe and doctor take nothing; anything else is usage', () => {
    expect(parseArgs(['describe'])).toEqual({ kind: 'describe' })
    expect(parseArgs(['doctor'])).toEqual({ kind: 'doctor' })
    expect(() => parseArgs(['describe', 'x'])).toThrow(UsageError)
    expect(() => parseArgs([])).toThrow(/usage: pnpm sim/)
    expect(() => parseArgs(['fly'])).toThrow(/unknown command "fly"/)
  })
})

describe('device lookup', () => {
  it('finds a device by exact name and the booted one, skipping unavailable runtimes', () => {
    expect(findDevice(devices('Shutdown'), 'iPhone 16')?.udid).toBe(UDID)
    expect(findDevice(devices('Shutdown'), 'iPhone 15')).toBeUndefined()
    expect(findBooted(devices('Shutdown'))).toBeUndefined()
    expect(findBooted(devices('Booted'))?.udid).toBe(UDID)
  })
})

describe('execute → argv', () => {
  it('boot resolves the name to a UDID, waits with bootstatus -b, shows the window, opens the URL', async () => {
    const { deps, calls, logs } = fake({}, 'Shutdown')
    expect(await execute({ kind: 'boot', device: 'iPhone 16', url: DEV_URL }, deps)).toBe(0)
    expect(calls).toEqual([
      ['xcrun', 'simctl', 'list', 'devices', '-j'],
      ['xcrun', 'simctl', 'bootstatus', UDID, '-b'],
      ['open', '-a', 'Simulator'],
      ['xcrun', 'simctl', 'openurl', UDID, DEV_URL],
    ])
    expect(logs[0]).toContain(DEV_URL)
  })

  it('boot names the available devices when the requested one does not exist', async () => {
    const { deps, calls } = fake({}, 'Shutdown')
    await expect(execute({ kind: 'boot', device: 'iPhone 99', url: DEV_URL }, deps)).rejects.toThrow(
      /no simulator named "iPhone 99"; available: iPad \(A16\), iPhone 16, iPhone 16 Pro/,
    )
    expect(calls).toHaveLength(1)
  })

  it('shot creates the folder and screenshots the booted device into it', async () => {
    const { deps, calls, logs, dirs } = fake()
    expect(await execute({ kind: 'shot', name: 'phase2-home' }, deps)).toBe(0)
    expect(dirs).toEqual([SHOT_DIR])
    expect(calls).toEqual([['xcrun', 'simctl', 'io', 'booted', 'screenshot', `${SHOT_DIR}/phase2-home.png`]])
    expect(logs).toEqual([`${SHOT_DIR}/phase2-home.png`])
  })

  it('tap, swipe and rotate go to idb against the booted UDID', async () => {
    const { deps, calls } = fake()
    await execute({ kind: 'tap', x: 196, y: 500 }, deps)
    await execute({ kind: 'swipe', x1: 196, y1: 500, x2: 196, y2: 200, ms: 250 }, deps)
    await execute({ kind: 'rotate', orientation: 'landscape' }, deps)
    await execute({ kind: 'rotate', orientation: 'portrait' }, deps)
    const idbCalls = calls.filter(([cmd]) => cmd === 'idb')
    expect(idbCalls).toEqual([
      ['idb', 'ui', 'tap', '196', '500', '--udid', UDID],
      ['idb', 'ui', 'swipe', '--duration', '0.25', '196', '500', '196', '200', '--udid', UDID],
      ['idb', 'ui', 'rotate', 'LANDSCAPE_RIGHT', '--udid', UDID],
      ['idb', 'ui', 'rotate', 'PORTRAIT', '--udid', UDID],
    ])
  })

  it('idb commands refuse to run with nothing booted', async () => {
    const { deps, calls } = fake({}, 'Shutdown')
    await expect(execute({ kind: 'tap', x: 1, y: 1 }, deps)).rejects.toThrow(/no simulator is booted/)
    expect(calls.some(([cmd]) => cmd === 'idb')).toBe(false)
  })

  it('describe prints the accessibility tree verbatim', async () => {
    const tree = '[{"AXLabel":"Search beaches","frame":{"x":16,"y":120,"width":361,"height":44}}]\n'
    const { deps, calls, logs } = fake({ 'idb ui describe-all': { stdout: tree } })
    expect(await execute({ kind: 'describe' }, deps)).toBe(0)
    expect(calls.at(-1)).toEqual(['idb', 'ui', 'describe-all', '--api', 'axbridge', '--udid', UDID])
    expect(logs).toEqual([tree.trimEnd()])
  })

  it('locate sets the simulated location on the booted device', async () => {
    const { deps, calls } = fake()
    await execute({ kind: 'locate', lat: 44.64, lon: -63.57 }, deps)
    expect(calls).toEqual([['xcrun', 'simctl', 'location', 'booted', 'set', '44.64,-63.57']])
  })

  it('a failing subprocess surfaces its stderr', async () => {
    const { deps } = fake({ 'xcrun simctl io': { code: 1, stderr: 'No devices are booted.' } })
    await expect(execute({ kind: 'shot', name: 'x' }, deps)).rejects.toThrow(
      /xcrun simctl io booted screenshot .* exited 1\nNo devices are booted\./,
    )
  })
})

describe('doctor', () => {
  it('exits 0 when every tool answers and the device exists', async () => {
    const { deps, logs } = fake({ 'idb_companion --version': { stdout: '{"build_date":"Sep 11 2026"}' } })
    expect(await execute({ kind: 'doctor' }, deps)).toBe(0)
    expect(logs).toEqual([
      'ok       xcrun simctl: ok',
      'ok       idb_companion: {"build_date":"Sep 11 2026"}',
      'ok       idb: ok',
      `ok       iPhone 16 simulator: ${UDID} (Booted)`,
    ])
  })

  it('exits 1 and prints the install line for each missing tool', async () => {
    const { deps, logs } = fake({
      'idb_companion': { code: 127, stderr: 'idb_companion: command not found' },
      'idb list-targets': { code: 127, stderr: 'idb: command not found' },
    })
    expect(await execute({ kind: 'doctor' }, deps)).toBe(1)
    expect(logs.join('\n')).toMatch(/missing  idb_companion: idb_companion: command not found\n\s+brew tap facebook\/fb/)
    expect(logs.join('\n')).toMatch(/missing  idb: idb: command not found\n\s+brew install python@3.12/)
  })
})

describe('main', () => {
  it('returns 2 on usage errors and 1 on execution errors, logging both', async () => {
    const { deps, logs } = fake({}, 'Shutdown')
    expect(await main(['nope'], deps)).toBe(2)
    expect(logs[0]).toMatch(/unknown command "nope"/)
    expect(await main(['tap', '1', '2'], deps)).toBe(1)
    expect(logs.at(-1)).toMatch(/^sim tap: no simulator is booted/)
  })
})
