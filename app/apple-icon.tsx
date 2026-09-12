import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default async function Icon() {
  const logoData = await readFile(join(process.cwd(), 'public/logo.png'))
  const base64 = logoData.toString('base64')

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#efeeea',
        }}
      >
        <img
          alt=""
          src={`data:image/png;base64,${base64}`}
          width={150}
          height={150}
          style={{ objectFit: 'contain' }}
        />
      </div>
    ),
    size,
  )
}
