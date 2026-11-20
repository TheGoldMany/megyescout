import Link from "next/link";
import { Radar, ClipboardList, Database, LogOut, Search } from "lucide-react";
import { getSession, authEnabled } from "@/lib/session";
import { getWorkspace } from "@/lib/queries";
import { logoutAction } from "@/app/actions";
import { NavLink } from "./nav-link";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const ws = session ? await getWorkspace(session.workspaceId).catch(() => null) : null;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/30">
              <Radar className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">
              HUN<span className="text-primary">·</span>SCOUT
            </span>
          </Link>
          {session && (
            <nav className="ml-2 flex items-center gap-1 text-sm">
              <NavLink href="/" icon={<Search className="h-4 w-4" />}>
                Kereső
              </NavLink>
              <NavLink href="/shortlist" icon={<ClipboardList className="h-4 w-4" />}>
                Igazolási tábla
              </NavLink>
              <NavLink href="/data" icon={<Database className="h-4 w-4" />}>
                Adatállapot
              </NavLink>
            </nav>
          )}
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            {ws && (
              <span className="hidden items-center gap-1.5 rounded-md border px-2 py-1 md:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                {ws.club_name} munkaterület
              </span>
            )}
            {session && <span className="hidden sm:inline">{session.name}</span>}
            {session && authEnabled() && (
              <form action={logoutAction}>
                <button className="rounded p-1.5 hover:bg-secondary" title="Kijelentkezés" aria-label="Kijelentkezés">
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 sm:px-6 sm:py-6">{children}</main>
      <footer className="border-t py-4 text-center text-[11px] text-muted-foreground">
        Forrás: MLSZ adatbank nyilvános jegyzőkönyvei · a mutatók proxy-becslések, nem hivatalos statisztikák
      </footer>
    </div>
  );
}
