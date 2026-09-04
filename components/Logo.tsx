/**
 * The mark, inline.
 *
 * Drawn rather than loaded from /icon.svg so it inherits the current text
 * colour for the waves and needs no second request. The amber H stays amber in
 * both themes because it is the brand; only the waves follow the ink.
 */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className="shrink-0"
    >
      <rect width="32" height="32" rx="7" fill="#1a1815" />
      <path
        d="M9 20V12a3 3 0 0 1 6 0v8"
        fill="none"
        stroke="#f59e0b"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path d="M9 16.5h6" fill="none" stroke="#f59e0b" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M19.5 12.5c1.6 1 1.6 6 0 7"
        fill="none"
        stroke="#fbf9f4"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M23 10c3 2.4 3 9.6 0 12"
        fill="none"
        stroke="#fbf9f4"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
