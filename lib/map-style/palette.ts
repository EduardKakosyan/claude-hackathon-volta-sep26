/**
 * The "Tide Table paper" map palette.
 *
 * The first block is the shell's own tokens from components/beach-shell.css,
 * repeated here because a MapLibre style is JSON and cannot read a CSS custom
 * property; lib/map-style.test.ts fails if the two drift. The second block is
 * the map-only tones derived from the same paper: a teal wash for water, a
 * shade darker for buildings and minor roads, white for the roads that matter.
 *
 * Nothing here may borrow a status colour. Green, amber and red belong to the
 * pins alone, which is what makes a status the most saturated thing on screen.
 */
export const PAPER = {
  /* --beach-* tokens */
  paper: '#efeeea',
  panel: '#f9f8f4',
  ink: '#242a29',
  muted: '#626b68',
  accent: '#0f5f65',
  rule: '#d2d6cf',

  /* map-only tones */
  residential: '#eae9e4',
  wood: '#e3e6df',
  park: '#e1e7e0',
  water: '#cfe0dd',
  waterEdge: '#b9d0cc',
  building: '#e6e5df',
  buildingLine: '#d8d7d1',
  roadMinor: '#dcdfd8',
  roadMajor: '#ffffff',
  roadMajorCase: '#c9cec6',
  roadMotor: '#ffffff',
  roadMotorCase: '#b8bdb6',
  /** Label halo: the panel colour at 85%, so text sits on paper rather than on a white sticker. */
  halo: 'rgba(249,248,244,0.85)',
} as const

export type PaperPalette = typeof PAPER

/** The shell tokens the first block mirrors, for the drift test. */
export const SHELL_TOKENS: Record<'paper' | 'panel' | 'ink' | 'muted' | 'accent' | 'rule', string> = {
  paper: '--beach-bg',
  panel: '--beach-panel',
  ink: '--beach-ink',
  muted: '--beach-muted',
  accent: '--beach-accent',
  rule: '--beach-rule',
}
