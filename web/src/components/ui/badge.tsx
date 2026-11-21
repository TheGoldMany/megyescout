import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 border-2 border-black px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-primary text-black",
        accent: "bg-accent text-black",
        secondary: "bg-secondary text-black",
        outline: "bg-white text-black",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
