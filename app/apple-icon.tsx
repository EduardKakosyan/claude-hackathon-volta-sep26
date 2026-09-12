import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
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
        }}
      >
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: 9999,
            background: '#16a34a',
            border: '13px solid #ffffff',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          }}
        />
      </div>
    ),
    size,
  )
}
