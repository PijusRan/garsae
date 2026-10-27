// One icon set for the whole app: 20px grid, 1.5px stroke, round caps and joins.
// Play and pause are filled, because a solid glyph reads better at transport size.
import type { ReactNode, SVGProps } from 'react';

type IconProps = { size?: number } & Omit<SVGProps<SVGSVGElement>, 'children'>;

function Icon({ size = 20, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.5 4.6v10.8a.8.8 0 0 0 1.2.7l8.6-5.4a.8.8 0 0 0 0-1.4L7.7 3.9a.8.8 0 0 0-1.2.7z" fill="currentColor" stroke="none" />
  </Icon>
);

export const PauseIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="4" width="3.4" height="12" rx="1" fill="currentColor" stroke="none" />
    <rect x="11.6" y="4" width="3.4" height="12" rx="1" fill="currentColor" stroke="none" />
  </Icon>
);

export const VolumeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 8v4h3l4 3.25V4.75L6.5 8z" />
    <path d="M13.5 7.5a3.5 3.5 0 0 1 0 5M15.75 5.5a6.5 6.5 0 0 1 0 9" />
  </Icon>
);

export const TimerIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="11" r="6" />
    <path d="M10 8v3l2 1.5M8 2.75h4" />
  </Icon>
);

export const ShareIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 12.5V3.25M6.75 6.25 10 3l3.25 3.25" />
    <path d="M6.5 9H5.25a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h9.5a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1H13.5" />
  </Icon>
);

export const MixesIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 6h13M3.5 10h13M3.5 14h8" />
  </Icon>
);

export const MoreIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="5" cy="10" r=".9" fill="currentColor" />
    <circle cx="10" cy="10" r=".9" fill="currentColor" />
    <circle cx="15" cy="10" r=".9" fill="currentColor" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
  </Icon>
);

export const EditIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12.75 4.25l3 3L7.5 15.5l-3.75.75.75-3.75z" />
  </Icon>
);

export const ReplaceIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15.5 8.5A5.75 5.75 0 0 0 5 6.5M4.5 11.5A5.75 5.75 0 0 0 15 13.5" />
    <path d="M5 3.5v3h3M15 16.5v-3h-3" />
  </Icon>
);

export const ChevronIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 8l4 4 4-4" />
  </Icon>
);

export const HeadphonesIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.75 13v-2.5a6.25 6.25 0 0 1 12.5 0V13" />
    <rect x="3.75" y="11.5" width="3" height="5" rx="1" />
    <rect x="13.25" y="11.5" width="3" height="5" rx="1" />
  </Icon>
);

/** Marks effect tiles: they shape the whole mix rather than add a sound. */
export const EffectIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.75 10c1.5-4 3-4 4.5 0s3 4 4.5 0 3-4 4.5 0" />
    <path d="M17.25 6.5v7" />
  </Icon>
);

/** The Garsae mark: an eclipse ring setting behind a horizon. */
export const MarkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.88 13.5A6.5 6.5 0 1 1 15.12 13.5" />
    <path d="M1.75 13.5h16.5" />
  </Icon>
);
