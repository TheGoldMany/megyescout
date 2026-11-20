import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <h1 className="text-2xl font-semibold">Nincs ilyen oldal</h1>
      <p className="mt-2 text-sm text-muted-foreground">A keresett játékos vagy oldal nem található.</p>
      <Link href="/" className="mt-4 inline-block text-sm text-primary hover:underline">
        Vissza a keresőhöz
      </Link>
    </div>
  );
}
