import Link from "next/link";
import { ArrowLeftRight, ClipboardList, LogOut, Search, Shield, Trophy } from "lucide-react";
import { getSession, authEnabled } from "@/lib/session";
import { logoutAction } from "@/app/actions";
import { NavLink, TabLink } from "./nav-link";
import { SetupNotice } from "./setup-notice";
import { schemaReady } from "@/lib/queries";

const NAV = [
  { href: "/explorer", label: "Játékoskereső", short: "Keresés", icon: <Search className="h-4 w-4" /> },
  { href: "/leagues", label: "Bajnokságok", short: "Tabellák", icon: <Trophy className="h-4 w-4" /> },
  { href: "/transfers", label: "Átigazolások", short: "Átigazolás", icon: <ArrowLeftRight className="h-4 w-4" /> },
  { href: "/shortlist", label: "Figyelőlista", short: "Figyelőlista", icon: <ClipboardList className="h-4 w-4" /> },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // a database without tables answers every page with an error: explain the missing setup instead
  const ready = await schemaReady().catch(() => true); // connection errors keep the regular error page
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b-[3px] border-black bg-background">
        {/* the roof: steel truss with floodlight heads at both ends */}
        <div className="truss relative h-4" aria-hidden>
          <div className="lamps floodlight-on absolute -bottom-3 left-2 h-5 w-12" />
          <div className="lamps floodlight-on absolute -bottom-3 right-2 h-5 w-12" />
        </div>
        <div className="concrete">
          <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2" aria-label="Megyescout címlap">
              <span aria-hidden className="grid h-10 w-10 place-items-center border-[3px] border-black bg-accent shadow-[3px_3px_0_#000]">
                <span className="h-3.5 w-6 border-x-[3px] border-t-[3px] border-black" />
              </span>
              <span className="hidden font-display text-3xl font-extrabold leading-none tracking-tight sm:inline">
                Megyescout
              </span>
            </Link>
            {session && (
              <nav className="ml-2 hidden items-center gap-1.5 py-1 pr-1 text-sm md:flex" aria-label="Fő navigáció">
                {NAV.map((n) => (
                  <NavLink key={n.href} href={n.href} icon={n.icon}>
                    {n.label}
                  </NavLink>
                ))}
              </nav>
            )}
            <div className="ml-auto flex items-center gap-2">
              {session && (
                <Link
                  href="/explorer"
                  className="grid h-10 w-10 place-items-center border-[3px] border-black bg-white hover:bg-accent lg:hidden"
                  aria-label="Keresés"
                >
                  <Search className="h-5 w-5" />
                </Link>
              )}
              {session && (
                <form action="/explorer" className="hidden lg:block" role="search">
                  <label className="flex h-10 items-center gap-2 border-[3px] border-black bg-white px-2 text-sm focus-within:bg-[#fff6cc]">
                    <Search className="h-4 w-4" />
                    <input
                      name="q"
                      placeholder="Játékos, klub, település"
                      className="w-48 bg-transparent placeholder:text-[#464b52] focus:outline-none"
                      aria-label="Keresés"
                    />
                  </label>
                </form>
              )}
              {session && authEnabled() && (
                <>
                  <span className="hidden text-xs font-semibold xl:inline">{session.name}</span>
                  <form action={logoutAction}>
                    <button className="border-[3px] border-black bg-white p-1.5 hover:bg-accent" title="Kijelentkezés" aria-label="Kijelentkezés">
                      <LogOut className="h-4 w-4" />
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-5 sm:px-6 sm:py-7">
        {ready ? children : <SetupNotice />}
      </main>
      <footer className="border-t-[3px] border-black bg-black pb-16 text-white md:pb-0">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-1 px-3 py-4 text-xs text-white/80 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            A piaci értékek a Megyescout becslései a játékpercek, a liga szintje és az életkor alapján, nem hivatalos árak.
          </span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href="/modszertan" className="font-semibold text-white underline decoration-2 underline-offset-4 hover:bg-accent hover:text-black">
              Honnan jönnek az adatok?
            </Link>
            <Link href="/data" className="underline underline-offset-4 hover:bg-accent hover:text-black">
              Adatállapot
            </Link>
            <span>Forrás: az MLSZ adatbank nyilvános jegyzőkönyvei</span>
          </span>
        </div>
      </footer>
      {/* phones: a thumb-reachable tab bar with labels instead of bare icons */}
      {session && (
        <nav
          aria-label="Fő navigáció (mobil)"
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t-[3px] border-black bg-white md:hidden"
        >
          {NAV.map((n) => (
            <TabLink key={n.href} href={n.href} icon={n.icon}>
              {n.short}
            </TabLink>
          ))}
        </nav>
      )}
    </div>
  );
}
