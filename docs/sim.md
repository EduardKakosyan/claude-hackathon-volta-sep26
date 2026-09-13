# `pnpm sim`: the iOS Simulator rig

Playwright's WebKit projects are the assertion layer and run in CI. They cannot
fake Safari's collapsing URL bar and `100dvh`, the home-indicator safe areas,
the native geolocation alert, the share sheet, or how a drag feels under iOS
gesture recognisers. `pnpm sim` drives Mobile Safari on the iPhone 16 Simulator
for exactly those things. Its output is a PNG the agent reads, or an
accessibility tree it greps; nothing here asserts, and nothing here runs in CI.

`scripts/sim.ts` wraps two tools. Every subprocess goes through one `run()`
helper, and `scripts/sim.test.ts` covers the command → argv mapping with that
helper injected, so the unit suite never touches a simulator.

| Tool | Gives | Ships with |
| --- | --- | --- |
| `xcrun simctl` | boot, open URL, screenshot, simulated location | Xcode |
| `idb` + `idb_companion` | tap, swipe, rotate, accessibility tree with coordinates | two local installs below |

## The two local installs

`pnpm sim doctor` checks all of this and prints the install line for anything
missing. Run it first.

### 1. `idb_companion` (Meta, Homebrew tap `facebook/fb`)

```bash
brew tap facebook/fb
brew install idb-companion
```

The formula has no bottle, so Homebrew treats it as a from-source build and
runs its own "minimum Xcode for this macOS" check before touching the formula.
On a macOS that is newer than the installed Xcode (macOS 27.0 with Xcode 26.3,
for example) that check refuses with *"Your Xcode (26.3) … is too outdated.
Please update to Xcode 27.0"*, even though the formula itself only asks for
Xcode 26.0. The formula's install block is nothing more than "unpack the
release tarball and symlink `idb_companion`", so do the same by hand:

```bash
curl -L -o /tmp/idb-companion.tar.gz \
  https://github.com/facebook/idb/releases/download/v1.5.7/idb-companion.macos-arm64.tar.gz
shasum -a 256 /tmp/idb-companion.tar.gz   # compare with the sha256 in the formula
mkdir -p ~/.local/share/idb-companion
tar xzf /tmp/idb-companion.tar.gz -C ~/.local/share/idb-companion
ln -sfn ~/.local/share/idb-companion/idb_companion /opt/homebrew/bin/idb_companion
idb_companion --version        # {"build_date":…}
```

Keep the tree intact: the companion resolves `Resources/` next to its own
binary and crashes when the shims are missing. To remove it later, delete the
directory and the symlink.

### 2. `idb` (the Python client, `fb-idb`, Python ≤ 3.12)

`fb-idb` does not install on Python 3.13+, and Homebrew's Python is
externally managed (PEP 668), so use a virtual environment on a pinned
interpreter:

```bash
brew install python@3.12
python3.12 -m venv ~/.local/share/fb-idb
~/.local/share/fb-idb/bin/pip install fb-idb
ln -sfn ~/.local/share/fb-idb/bin/idb /opt/homebrew/bin/idb
idb list-targets               # lists every simulator Xcode knows
```

`idb` starts an `idb_companion` for a local simulator on demand as long as
`idb_companion` is on `PATH`; nothing needs to be launched by hand.

## Commands

```text
pnpm sim doctor                         xcrun, idb_companion, idb, and the iPhone 16 simulator
pnpm sim boot [device]                  boot (waits until SpringBoard is up), show the window,
                                        open http://localhost:3000 in Safari
pnpm sim prod [device]                  the same against https://www.nsbeaches.ca
pnpm sim shot <name>                    PNG → test-results/sim/<name>.png (gitignored)
pnpm sim tap <x> <y>                    tap a point (screen points, not pixels)
pnpm sim swipe <x1> <y1> <x2> <y2> [ms] drag between two points; default 250 ms
pnpm sim rotate <portrait|landscape>    rotate the device
pnpm sim describe                       accessibility tree with a frame per element (stdout)
pnpm sim locate <lat>,<lon>             simulated location, e.g. 44.64,-63.57 for downtown Halifax
```

`device` defaults to `iPhone 16`; any name from `xcrun simctl list devices`
works. The tap/swipe/rotate/describe commands target whichever simulator is
booted, so `boot` first. Coordinates are in points on the 393 × 852 iPhone 16
screen, the same units `describe` reports.

`boot` opens the dev server, so run `pnpm dev` in another terminal first. The
Simulator's Safari reaches `localhost` on the Mac directly.

## A typical look

```bash
pnpm dev &                      # once
pnpm sim boot                   # iPhone 16 booted; Safari opened http://localhost:3000
pnpm sim shot p3-half           # test-results/sim/p3-half.png — read it
pnpm sim swipe 196 500 196 200  # drag the sheet up
pnpm sim shot p3-full
pnpm sim rotate landscape && pnpm sim shot p3-land
pnpm sim rotate portrait
```

## Finding something to tap

`describe` prints one JSON object per element with its `AXLabel`, `type`,
`role` and `frame` (`x`, `y`, `width`, `height` in points). It reads through
idb's `axbridge` backend: the default backend stops at Safari's own chrome
(address bar, reload, toolbar) and never enters the web view, whereas
`axbridge` walks the UIKit hierarchy into the WKWebView and reports the page's
elements. Tap the centre of a frame:

```bash
pnpm sim describe | grep -o '{[^}]*"type":"SearchField"[^}]*}'
# … "frame":{"x":57,"y":146,"width":307,"height":24} …
pnpm sim tap 210 158
```

A beach row reads as one button whose label is the name, distance, water body,
region and status joined together, for example
`"AXLabel":"Taylor Head Beach 82 km Atlantic Ocean · Eastern Shore Open"`.

## The geolocation alert

The first `navigator.geolocation` call in Safari raises a native alert
("localhost" would like to use your current location) that only a native tap
can answer. Set the location first so the answer is useful:

```bash
pnpm sim locate 44.64,-63.57            # downtown Halifax
pnpm sim boot                           # or reload the page
pnpm sim describe | grep -o '{[^}]*"AXLabel":"Allow[^}]*}'
pnpm sim tap <centre of the Allow frame>
```

Safari remembers the answer per site. To be asked again:

```bash
xcrun simctl privacy booted reset location
```

The reset also clears Safari's own app-level permission the first time, so the
next request raises two alerts in a row: the system one ("Allow 'Safari' to use
your location?", answer `Allow While Using App`), then the site one
("'localhost' Would Like to Use Your Location", `Allow` / `Don't Allow`).
`describe` reports both with frames; tap the first, describe again, tap the
second. A later reset re-prompts only the site alert.

## What the Simulator cannot do

Web Push (`PushManager`) and Add to Home Screen do not work in the Simulator;
both are verified once on a physical iPhone against nsbeaches.ca. The
Simulator also has no camera and no cellular network.
