"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Gates of the stand: painted gate boards; the open gate is the black one.
export function NavLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 whitespace-nowrap border-[3px] border-black bg-white px-3 font-bold text-black hover:bg-accent",
        active && "bg-black text-white hover:bg-black",
      )}
    >
      {icon}
      <span className="hidden md:inline">{children}</span>
    </Link>
  );
}

// Phone tab bar item: icon above a short label; the open tab is black.
export function TabLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const active = path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-16 flex-col items-center justify-center gap-1 border-r-[3px] border-black text-xs font-bold last:border-r-0",
        active ? "bg-black text-white" : "bg-white text-black active:bg-accent",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
