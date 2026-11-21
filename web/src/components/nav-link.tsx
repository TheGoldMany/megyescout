"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Gates of the stand: the active one is lit from below by a floodlight-amber bar.
export function NavLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex h-14 items-center gap-1.5 whitespace-nowrap px-3 text-muted-foreground transition-colors hover:text-foreground",
        active && "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-1 after:bg-accent",
      )}
    >
      {icon}
      <span className="hidden md:inline">{children}</span>
    </Link>
  );
}
