import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b1220',
          borderRadius: 96,
        }}
      >
        <div
          style={{
            width: 280,
            height: 280,
            borderRadius: 9999,
            background: '#16a34a',
            border: '36px solid #ffffff',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          }}
        />
      </div>
    ),
    size,
  )
}
