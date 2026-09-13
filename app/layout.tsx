import type { Metadata, Viewport } from 'next'
import { Geist, Source_Serif_4 } from 'next/font/google'

import './globals.css'
import { THEME_COLOR, baseMetadata } from '@/lib/metadata'
import { VAPID_META_NAME } from '@/lib/push/browser'
import { vapidPublicKey } from '@/lib/push/server'

/**
 * Two families, both self-hosted by `next/font` so neither blocks first paint:
 * Geist for controls and data, Source Serif 4 for the masthead and beach names.
 * The serif is what makes this read as a printed tide table rather than a dashboard.
 */
const geistSans = Geist({ variable: '--font-sans', subsets: ['latin'] })
const sourceSerif = Source_Serif_4({
  variable: '--font-serif',
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
})

/**
 * The page's metadata plus the one thing the follow bell needs from the
 * server: the VAPID public key, as `<meta name="vapid-public-key">`. Read per
 * request so the key the browser subscribes with is the key the refresh
 * signs with — real from the environment, throwaway in local dev (lib/push/server.ts).
 * The service worker itself is registered by the bell on its first tap, not here.
 */
export function generateMetadata(): Metadata {
  const key = vapidPublicKey()
  const base = baseMetadata()
  return key ? { ...base, other: { [VAPID_META_NAME]: key } } : base
}

export const viewport: Viewport = {
  // The results panel sits against the home indicator on a phone.
  viewportFit: 'cover',
  themeColor: THEME_COLOR,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  )
}
