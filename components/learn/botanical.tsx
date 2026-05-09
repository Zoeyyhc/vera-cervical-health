import type { SVGProps } from "react";

const baseProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function FernFrond(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" {...baseProps} {...props}>
      <path d="M10 54 C 22 42, 34 30, 54 10" />
      <path d="M18 46 C 22 44, 26 44, 28 48" />
      <path d="M24 40 C 28 38, 32 38, 34 42" />
      <path d="M30 34 C 34 32, 38 32, 40 36" />
      <path d="M36 28 C 40 26, 44 26, 46 30" />
      <path d="M42 22 C 46 20, 50 20, 52 24" />
    </svg>
  );
}

export function Eucalyptus(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" {...baseProps} {...props}>
      <path d="M10 50 C 22 38, 36 26, 56 10" />
      <ellipse cx="20" cy="42" rx="5" ry="3" transform="rotate(-30 20 42)" />
      <ellipse cx="30" cy="32" rx="5" ry="3" transform="rotate(-30 30 32)" />
      <ellipse cx="40" cy="22" rx="5" ry="3" transform="rotate(-30 40 22)" />
      <ellipse cx="50" cy="14" rx="4" ry="2.5" transform="rotate(-30 50 14)" />
    </svg>
  );
}

export function Ginkgo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" {...baseProps} {...props}>
      <path d="M32 56 L 32 36" />
      <path d="M32 36 C 14 34, 12 18, 22 10 C 28 18, 30 26, 32 36 C 34 26, 36 18, 42 10 C 52 18, 50 34, 32 36 Z" />
    </svg>
  );
}

export function Branch(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" {...baseProps} {...props}>
      <path d="M8 56 C 24 44, 40 28, 58 8" />
      <path d="M22 42 L 14 36" />
      <path d="M32 32 L 26 24" />
      <path d="M42 22 L 36 14" />
    </svg>
  );
}

export function Leaf(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" {...baseProps} {...props}>
      <path d="M12 52 C 12 28, 28 12, 52 12 C 52 36, 36 52, 12 52 Z" />
      <path d="M12 52 L 52 12" />
    </svg>
  );
}

export function WillowSprig(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" {...baseProps} {...props}>
      <path d="M32 6 C 28 24, 28 42, 32 58" />
      <path d="M32 18 C 26 22, 22 28, 22 34" />
      <path d="M32 28 C 38 32, 42 38, 42 44" />
      <path d="M32 38 C 26 42, 22 48, 22 54" />
    </svg>
  );
}
