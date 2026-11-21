import Link from "next/link";
import { ArrowLeftRight, ClipboardList, Database, LogOut, Search, Shield, Trophy } from "lucide-react";
import { getSession, authEnabled } from "@/lib/session";
import { logoutAction } from "@/app/actions";
import { NavLink } from "./nav-link";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b-4 border-[#2a3038] bg-background">
        {/* the roof: steel truss with floodlight heads at both ends */}
        <div className="truss relative h-3" aria-hidden>
          <div className="lamps floodlight-on absolute -bottom-2 left-0 h-4 w-10" />
          <div className="lamps floodlight-on absolute -bottom-2 right-0 h-4 w-10" />
        </div>
        <div className="concrete">
          <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2" aria-label="Megyescout címlap">
              <span aria-hidden className="grid h-8 w-8 place-items-center border-2 border-accent bg-black">
                <span className="h-3 w-5 border-x-2 border-t-2 border-primary" />
              </span>
              <span className="hidden font-display text-2xl font-bold leading-none tracking-tight sm:inline">
                Megyescout
              </span>
            </Link>
            {session && (
              <nav className="ml-1 flex items-center overflow-x-auto text-sm" aria-label="Fő navigáció">
                <NavLink href="/explorer" icon={<Search className="h-4 w-4" />}>
                  Kereső
                </NavLink>
                <NavLink href="/leagues" icon={<Trophy className="h-4 w-4" />}>
                  Bajnokságok
                </NavLink>
                <NavLink href="/transfers" icon={<ArrowLeftRight className="h-4 w-4" />}>
                  Átigazolások
                </NavLink>
                <NavLink href="/shortlist" icon={<ClipboardList className="h-4 w-4" />}>
                  Igazolási tábla
                </NavLink>
                <NavLink href="/data" icon={<Database className="h-4 w-4" />}>
                  Adatállapot
                </NavLink>
              </nav>
            )}
            <div className="ml-auto flex items-center gap-2">
              {session && (
                <form action="/explorer" className="hidden lg:block" role="search">
                  <label className="flex h-9 items-center gap-2 border border-input bg-black px-2 text-sm focus-within:border-accent">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input
                      name="q"
                      placeholder="Játékos, klub, település"
                      className="w-48 bg-transparent placeholder:text-muted-foreground focus:outline-none"
                      aria-label="Keresés"
                    />
                  </label>
                </form>
              )}
              {session && authEnabled() && (
                <>
                  <span className="hidden text-xs text-muted-foreground xl:inline">{session.name}</span>
                  <form action={logoutAction}>
                    <button className="p-1.5 hover:bg-secondary" title="Kijelentkezés" aria-label="Kijelentkezés">
                      <LogOut className="h-4 w-4" />
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-5 sm:px-6 sm:py-7">{children}</main>
      <footer className="concrete border-t-4 border-[#2a3038]">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-1 px-3 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            A piaci értékek a Megyescout becslései a játékpercek, a liga szintje és az életkor alapján, nem hivatalos árak.
          </span>
          <span>Forrás: az MLSZ adatbank nyilvános jegyzőkönyvei</span>
        </div>
      </footer>
    </div>
  );
}
