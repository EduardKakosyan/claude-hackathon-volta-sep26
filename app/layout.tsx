import type { Metadata, Viewport } from 'next'
import { Geist, Source_Serif_4 } from 'next/font/google'

import './globals.css'

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

export const metadata: Metadata = {
  title: 'Is the Beach Open',
  description:
    'Today’s official status for every government-monitored beach in Nova Scotia, on one map.',
}

export const viewport: Viewport = {
  // The results panel sits against the home indicator on a phone.
  viewportFit: 'cover',
  themeColor: '#efeeea',
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
