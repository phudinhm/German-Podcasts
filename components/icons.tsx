/**
 * A small set of monochrome, single-color line icons that replace the
 * colorful emoji this app used to lean on for glyphs, badges, and
 * icon-only buttons. Every icon follows the same convention already
 * established elsewhere in this codebase (see GlobalFloatingTranscript.tsx):
 * a 24x24 viewBox, `stroke="currentColor"` with no fill, round caps/joins,
 * so the glyph always inherits whatever ink/accent color its container is
 * already themed with instead of carrying its own color.
 *
 * Usage: <IconStar className="w-4 h-4" /> - size and color come from the
 * className the caller passes, exactly like the ad-hoc <svg> elements this
 * replaces.
 */
import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement>;

function baseProps(props: IconProps): IconProps {
  const { strokeWidth = 2.2, className, ...rest } = props;
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    className: `shrink-0 ${className ?? ""}`.trim(),
    ...rest,
  };
}

export function IconSun(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
    </svg>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function IconPalette(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 3a9 9 0 1 0 0 18c1.3 0 2-1 1.5-2.2-.4-.9.2-1.8 1.1-1.8H16a5 5 0 0 0 5-5c0-5-4-9-9-9z" />
      <circle cx="7.5" cy="10.5" r="1" />
      <circle cx="12" cy="7.3" r="1" />
      <circle cx="16.3" cy="10.2" r="1" />
    </svg>
  );
}

export function IconStar(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6z" />
    </svg>
  );
}

export function IconStarFilled(props: IconProps) {
  const { className, ...rest } = props;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden
      className={`shrink-0 ${className ?? ""}`.trim()}
      {...rest}
    >
      <path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6z" />
    </svg>
  );
}

export function IconHeart(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 20.5s-7.5-4.6-10-9.3C.6 8 2 4.5 5.3 4c2-.3 3.7.7 4.7 2.2C11 4.7 12.7 3.7 14.7 4 18 4.5 19.4 8 20 11.2c-2.5 4.7-8 9.3-8 9.3z" />
    </svg>
  );
}

export function IconHeartFilled(props: IconProps) {
  const { className, ...rest } = props;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden
      className={`shrink-0 ${className ?? ""}`.trim()}
      {...rest}
    >
      <path d="M12 20.5s-7.5-4.6-10-9.3C.6 8 2 4.5 5.3 4c2-.3 3.7.7 4.7 2.2C11 4.7 12.7 3.7 14.7 4 18 4.5 19.4 8 20 11.2c-2.5 4.7-8 9.3-8 9.3z" />
    </svg>
  );
}

export function IconSpeaker(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M17.5 8.5a5 5 0 0 1 0 7" />
    </svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.7" />
    </svg>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M10.6 5.7A10.6 10.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.6 15.6 0 0 1-3 3.7M6.3 6.9C3.9 8.6 2.5 12 2.5 12s1.9 3.4 5 5.3M9.9 9.9a2.7 2.7 0 0 0 3.9 3.7" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

export function IconPin(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.3" />
    </svg>
  );
}

export function IconMusicNote(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M9 18V5.5l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="15.5" r="2.5" />
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9.5a1 1 0 0 0 1 1h3.5V16a1.5 1.5 0 0 1 3 0v4.5H17a1 1 0 0 0 1-1V10" />
    </svg>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M3 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.2h8.5A1.5 1.5 0 0 1 20.5 8.7v9.3A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18V6.5z" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.7-4.7" />
    </svg>
  );
}

export function IconWarning(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 3.5 21 19H3z" />
      <path d="M12 9.5v4.2" />
      <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconZap(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
    </svg>
  );
}

export function IconTarget(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconHourglass(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M6.5 2.5h11M6.5 21.5h11" />
      <path d="M7.5 2.5c0 4.8 2.2 6.7 4.5 8.5-2.3 1.8-4.5 3.7-4.5 8.5M16.5 2.5c0 4.8-2.2 6.7-4.5 8.5 2.3 1.8 4.5 3.7 4.5 8.5" />
    </svg>
  );
}

export function IconFire(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 2c1 3-3 4-3 8a3 3 0 1 0 6 0c1.5 1 2 2.7 2 4.5A5 5 0 1 1 7 14.5C7 10 10 8 12 2z" />
    </svg>
  );
}

export function IconSortAz(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 6h5M4 11h3.5M4 16h2" />
      <path d="M16 17V3M16 3l-3.2 3.2M16 3l3.2 3.2" />
    </svg>
  );
}

export function IconBarChart(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M5 20V10M11 20V4M17 20v-7" />
    </svg>
  );
}

export function IconHeadphones(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 15v-3a8 8 0 1 1 16 0v3" />
      <rect x="2.5" y="14" width="4" height="6" rx="1.5" />
      <rect x="17.5" y="14" width="4" height="6" rx="1.5" />
    </svg>
  );
}

export function IconClapperboard(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M3 9.5 5 5h3L6.5 9.5M9 9.5 10.5 5h3L12 9.5M15 9.5 16.5 5H19l-1.5 4.5" />
      <rect x="3" y="9.5" width="18" height="10" rx="1.5" />
    </svg>
  );
}

export function IconTv(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="2.5" y="4.5" width="19" height="13" rx="1.5" />
      <path d="M8 21h8" />
    </svg>
  );
}

export function IconExpand(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M8 3H4a1 1 0 0 0-1 1v4M16 3h4a1 1 0 0 1 1 1v4M8 21H4a1 1 0 0 1-1-1v-4M16 21h4a1 1 0 0 0 1-1v-4" />
    </svg>
  );
}

export function IconPopout(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="4" width="18" height="14" rx="1.5" />
      <rect x="12.5" y="11.5" width="6" height="4" rx="0.8" />
    </svg>
  );
}

export function IconChevronUp(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function IconArrowDown(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 4v16M6 14l6 6 6-6" />
    </svg>
  );
}

export function IconSwapVertical(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M8 3v14M8 17l-3-3M8 17l3-3M16 21V7M16 7l-3 3M16 7l3 3" />
    </svg>
  );
}

export function IconExternalLink(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

export function IconRedo(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v5h-5" />
    </svg>
  );
}

export function IconUndo(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 12a8 8 0 1 0 2.3-5.7" />
      <path d="M4 4v5h5" />
    </svg>
  );
}

export function IconBook(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 5a2 2 0 0 1 2-2h6v18H6a2 2 0 0 1-2-2z" />
      <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
    </svg>
  );
}

export function IconMegaphone(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M3 10v4h3l6 4V6L6 10H3z" />
      <path d="M17 8a4 4 0 0 1 0 8" />
    </svg>
  );
}

export function IconSparkle(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 3l1.2 4.8L18 9l-4.8 1.2L12 15l-1.2-4.8L6 9l4.8-1.2z" />
      <path d="M19 15l.6 2.4L22 18l-2.4.6L19 21l-.6-2.4L16 18l2.4-.6z" />
    </svg>
  );
}

export function IconMic(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M9 3.5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0z" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21M9 21h6" />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 6h5M13 6h7M4 12h9M17 12h3M4 18h11M19 18h1" />
      <circle cx="11" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

export function IconPlayFilled(props: IconProps) {
  const { className, ...rest } = props;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden
      className={`shrink-0 ${className ?? ""}`.trim()}
      {...rest}
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
