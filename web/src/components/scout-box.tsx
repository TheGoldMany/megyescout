"use client";

import { useActionState, useState } from "react";
import { Lock, Star, Video, Trash2, Check } from "lucide-react";
import { removeNoteAction, saveNoteAction } from "@/app/actions";
import type { ScoutNote } from "@/lib/queries";
import { STATUS_LABEL, type NoteStatus } from "@/lib/labels";
import { Button } from "./ui/button";
import { Input, Label, Textarea } from "./ui/input";
import { cn, fmtDateTime } from "@/lib/utils";

const STATUSES: NoteStatus[] = ["radar", "watching", "shortlist", "contacted", "rejected"];

export function ScoutBox({ playerId, note }: { playerId: string; note: ScoutNote | null }) {
  const [state, action, pending] = useActionState(saveNoteAction, null);
  const [status, setStatus] = useState<NoteStatus>(note?.status ?? "radar");
  const [rating, setRating] = useState<number>(note?.rating ?? 0);
  const [removing, setRemoving] = useState(false);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="playerId" value={playerId} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="rating" value={rating || ""} />
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3" /> Csak a klub stábja látja
      </div>

      <div>
        <Label>Státusz</Label>
        <div className="mt-1 flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs transition",
                status === s ? "border-primary/60 bg-primary/15 text-emerald-200" : "border-input text-muted-foreground hover:bg-secondary",
              )}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Értékelés</Label>
        <div className="mt-1 flex gap-0.5" role="radiogroup" aria-label="Értékelés 1–5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} csillag`}
              onClick={() => setRating(rating === n ? 0 : n)}
              className="p-0.5"
            >
              <Star className={cn("h-6 w-6", n <= rating ? "fill-accent text-accent" : "text-zinc-600")} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="videoUrl">Videó (Veo / YouTube, időbélyeggel)</Label>
        <div className="relative mt-1">
          <Video className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input id="videoUrl" name="videoUrl" type="url" defaultValue={note?.video_url ?? ""} placeholder="https://youtu.be/…?t=754" className="pl-8" />
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Szakmai jegyzet</Label>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={note?.notes ?? ""}
          className="mt-1"
          placeholder="Erősségek, gyengeségek, karakter, elérhetőség, munkahely/iskola…"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? "Mentés…" : "Mentés"}
        </Button>
        {note && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="Törlés a klub-széfből"
            aria-label="Törlés a klub-széfből"
            disabled={removing}
            onClick={async () => {
              if (!confirm("Biztosan törlöd a jegyzetet?")) return;
              setRemoving(true);
              await removeNoteAction(playerId);
              setRemoving(false);
              setStatus("radar");
              setRating(0);
            }}
          >
            <Trash2 />
          </Button>
        )}
      </div>
      {state && (
        <p className={cn("flex items-center gap-1 text-xs", state.ok ? "text-emerald-400" : "text-rose-400")}>
          {state.ok && <Check className="h-3.5 w-3.5" />} {state.message}
        </p>
      )}
      {note && !state && (
        <p className="text-[11px] text-muted-foreground">
          Utoljára: {note.author_name ?? "ismeretlen"} · {fmtDateTime(note.updated_at)}
        </p>
      )}
    </form>
  );
}
