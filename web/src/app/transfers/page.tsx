import Link from "next/link";
import { getTransferSeasons, getTransfers } from "@/lib/queries";
import { sessionOrLogin } from "@/lib/session";
import { SectorHeading, TransferList } from "@/components/stadium";
import { TIER_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Átigazolások" };

const PAGE = 40;

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; tier?: string; page?: string }>;
}) {
  const sp = await searchParams;
  await sessionOrLogin("/transfers");
  const seasons = await getTransferSeasons();
  const season = sp.season && seasons.includes(sp.season) ? sp.season : seasons[0];
  const tier = Number(sp.tier) || undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total } = await getTransfers({ season, tier, limit: PAGE, offset: (page - 1) * PAGE });
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { season, tier: tier ? String(tier) : undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/transfers?${q}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Átigazolások</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Klubváltás, ha egy játékos fő felnőtt csapata eltér az előző szezonbelitől. Az érték a játékos becsült piaci
          értéke az érkezése szezonjában; az átigazolási díjak nem nyilvánosak.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Szezon</span>
        {seasons.map((s) => (
          <Link key={s} href={href({ season: s, page: undefined })} className={cn("border-[3px] border-black px-2.5 py-1 font-display text-base font-bold", s === season ? "bg-black text-white" : "bg-white hover:bg-accent")}>
            {s}
          </Link>
        ))}
        <span className="ml-3 text-muted-foreground">Érkezési osztály</span>
        {[undefined, 3, 4, 5].map((t) => (
          <Link key={t ?? "all"} href={href({ tier: t ? String(t) : undefined, page: undefined })} className={cn("border-[3px] border-black px-2.5 py-1 font-semibold", t === tier ? "bg-black text-white" : "bg-white hover:bg-accent")}>
            {t ? TIER_LABEL[t] : "Mind"}
          </Link>
        ))}
      </div>

      <section>
        <SectorHeading sector="A" title={`${total} klubváltás`} sub={season ? `${season} szezon` : undefined} />
        <TransferList rows={rows} />
      </section>

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Lapozás">
          <span className="text-muted-foreground">
            {page}. / {pages} oldal
          </span>
          <span className="flex gap-1">
            <Link aria-disabled={page <= 1} href={href({ page: String(page - 1) })} className={cn("border border-border px-3 py-1 hover:border-accent", page <= 1 && "pointer-events-none opacity-40")}>
              Előző
            </Link>
            <Link aria-disabled={page >= pages} href={href({ page: String(page + 1) })} className={cn("border border-border px-3 py-1 hover:border-accent", page >= pages && "pointer-events-none opacity-40")}>
              Következő
            </Link>
          </span>
        </nav>
      )}
    </div>
  );
}
