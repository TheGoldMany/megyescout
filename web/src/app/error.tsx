"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shown instead of a bare 500 (e.g. database unreachable, missing DATABASE_URL on a fresh deployment).
// Details stay in the server logs; production hides the message and only passes a digest.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto mt-20 max-w-md rounded-lg border border-rose-500/30 bg-card p-6 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-rose-700" />
      <h1 className="mt-3 text-lg font-semibold">Valami hiba történt</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Az oldal adatait nem sikerült betölteni. Leggyakrabban az adatbázis nem érhető el, vagy egy új telepítésnél
        még hiányzik a <code className="font-mono">DATABASE_URL</code> beállítás.
      </p>
      {error.digest && <p className="mt-2 font-mono text-[11px] text-muted-foreground">Hibakód: {error.digest}</p>}
      <Button className="mt-4" variant="outline" onClick={reset}>
        <RotateCcw /> Újrapróbálás
      </Button>
    </div>
  );
}
