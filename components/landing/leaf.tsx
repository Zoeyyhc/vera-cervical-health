type Props = { size?: number; className?: string };

export const Leaf = ({ size = 24, className = "" }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M4 20c2-10 8-14 16-16-1 9-5 15-14 17" />
    <path d="M4 20c4-3 8-7 11-12" />
  </svg>
);

export const Sprig = ({ size = 24, className = "" }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 22V4" />
    <path d="M12 8c-2-1-4-1-5-3" />
    <path d="M12 12c2-1 4-1 5-3" />
    <path d="M12 16c-2-1-4-1-5-3" />
    <path d="M12 6c1.5-1 2-2 2-4" />
  </svg>
);

export const Dots = ({ size = 24, className = "" }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <circle cx="5" cy="12" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="19" cy="12" r="1.2" />
  </svg>
);
