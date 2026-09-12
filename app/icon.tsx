import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const size = { width: 512, height: 512 }
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
          borderRadius: 96,
        }}
      >
        <img
          alt=""
          src={`data:image/png;base64,${base64}`}
          width={420}
          height={420}
          style={{ objectFit: 'contain' }}
        />
      </div>
    ),
    size,
  )
}
