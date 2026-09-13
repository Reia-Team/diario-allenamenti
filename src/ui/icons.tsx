import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 24, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
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

export const IconHome = (p: IconProps) => (
  <Svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></Svg>
);
export const IconCalendar = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="4.5" width="18" height="16.5" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></Svg>
);
export const IconChart = (p: IconProps) => (
  <Svg {...p}><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 6-7" /></Svg>
);
export const IconHistory = (p: IconProps) => (
  <Svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></Svg>
);
export const IconList = (p: IconProps) => (
  <Svg {...p}><path d="M9 6h12M9 12h12M9 18h12" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></Svg>
);
export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
);
export const IconPlay = (p: IconProps) => <Svg {...p}><path d="M7 4.5v15l12-7.5z" fill="currentColor" /></Svg>;
export const IconPause = (p: IconProps) => <Svg {...p}><path d="M8 5v14M16 5v14" strokeWidth={3} /></Svg>;
export const IconCheck = (p: IconProps) => <Svg {...p}><path d="m4.5 12.5 5 5 10-11" strokeWidth={2.6} /></Svg>;
export const IconPlus = (p: IconProps) => <Svg {...p}><path d="M12 5v14M5 12h14" strokeWidth={2.6} /></Svg>;
export const IconMinus = (p: IconProps) => <Svg {...p}><path d="M5 12h14" strokeWidth={2.6} /></Svg>;
export const IconX = (p: IconProps) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
export const IconChevronLeft = (p: IconProps) => <Svg {...p}><path d="m15 5-7 7 7 7" /></Svg>;
export const IconChevronRight = (p: IconProps) => <Svg {...p}><path d="m9 5 7 7-7 7" /></Svg>;
export const IconUp = (p: IconProps) => <Svg {...p}><path d="m6 15 6-6 6 6" /></Svg>;
export const IconDown = (p: IconProps) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>;
export const IconTrash = (p: IconProps) => (
  <Svg {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>
);
export const IconEdit = (p: IconProps) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></Svg>;
export const IconTimer = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="13.5" r="7.5" /><path d="M12 13.5V10M9.5 2.5h5" /></Svg>
);
export const IconTrophy = (p: IconProps) => (
  <Svg {...p}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" /></Svg>
);
export const IconTrendUp = (p: IconProps) => <Svg {...p}><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></Svg>;
export const IconTrendDown = (p: IconProps) => <Svg {...p}><path d="m3 7 6 6 4-4 8 8" /><path d="M15 17h6v-6" /></Svg>;
export const IconTrendFlat = (p: IconProps) => <Svg {...p}><path d="M3 12h18" /><path d="m16 7 5 5-5 5" /></Svg>;
export const IconInfo = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></Svg>;
export const IconAlert = (p: IconProps) => (
  <Svg {...p}><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17v.5" /></Svg>
);
export const IconCloud = (p: IconProps) => <Svg {...p}><path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9a4.5 4.5 0 0 0 1 9z" /></Svg>;
export const IconDumbbell = (p: IconProps) => (
  <Svg {...p}><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" /></Svg>
);
export const IconSkip = (p: IconProps) => <Svg {...p}><path d="M5 5v14l10-7z" /><path d="M19 5v14" /></Svg>;
export const IconStop = (p: IconProps) => <Svg {...p}><rect x="6" y="6" width="12" height="12" rx="1.5" /></Svg>;
export const IconSearch = (p: IconProps) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></Svg>;
export const IconCopy = (p: IconProps) => <Svg {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></Svg>;
export const IconArchive = (p: IconProps) => <Svg {...p}><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v12h14V8M10 12h4" /></Svg>;
export const IconNote = (p: IconProps) => <Svg {...p}><path d="M5 3h10l4 4v14H5z" /><path d="M9 11h6M9 15h6" /></Svg>;
