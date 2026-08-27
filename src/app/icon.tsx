import { ImageResponse } from 'next/og';

/**
 * Favicon. Uses the solid-rule variant of the mark: dashes blur into a line at
 * this size, so the shape is drawn the way it will actually be seen.
 */
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

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
          background: '#0d1512',
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="7.6" stroke="#f0a882" strokeWidth="2.2" />
          <path d="M1.4 14.6H22.6" stroke="#f0a882" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="12" cy="9" r="2" fill="#f0a882" />
        </svg>
      </div>
    ),
    size,
  );
}
