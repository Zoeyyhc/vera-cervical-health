import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "ghost";
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

export const LandingButton = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "primary", className, ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center px-4 py-2 rounded-standard text-base transition-opacity focus:outline-none focus-visible:shadow-focus-soft active:opacity-80";
    const v =
      variant === "primary"
        ? "bg-foreground text-off-white shadow-btn-inset"
        : "bg-transparent text-foreground border border-charcoal/40";
    return <button ref={ref} className={cn(base, v, className)} {...props} />;
  }
);
LandingButton.displayName = "LandingButton";
