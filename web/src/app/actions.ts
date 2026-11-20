"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteNote, upsertNote } from "@/lib/queries";
import { DEFAULT_WORKSPACE, SESSION_COOKIE, requireSession, sign } from "@/lib/session";

const noteSchema = z.object({
  playerId: z.string().uuid(),
  status: z.enum(["radar", "watching", "shortlist", "contacted", "rejected"]),
  rating: z.coerce.number().int().min(1).max(5).nullable(),
  notes: z.string().max(5000).nullable(),
  videoUrl: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//.test(u), "csak http(s) link")
    .nullable(),
});

export type ActionResult = { ok: boolean; message: string };

function emptyToNull(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

export async function saveNoteAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = noteSchema.safeParse({
    playerId: form.get("playerId"),
    status: form.get("status"),
    rating: emptyToNull(form.get("rating")),
    notes: emptyToNull(form.get("notes")),
    videoUrl: emptyToNull(form.get("videoUrl")),
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { ok: false, message: field === "videoUrl" ? "Érvénytelen videó link." : "Hibás adatok." };
  }
  await upsertNote(session.workspaceId, session.name, parsed.data);
  revalidatePath(`/players/${parsed.data.playerId}`);
  revalidatePath("/shortlist");
  revalidatePath("/");
  return { ok: true, message: "Mentve a klub-széfbe." };
}

export async function quickStatusAction(playerId: string, status: string, notes?: string | null, rating?: number | null) {
  const session = await requireSession();
  const parsed = noteSchema.parse({ playerId, status, rating: rating ?? null, notes: notes ?? null, videoUrl: null });
  // keep an existing video link: read-modify-write through the upsert with the current values
  const { getNote } = await import("@/lib/queries");
  const current = await getNote(session.workspaceId, playerId);
  await upsertNote(session.workspaceId, session.name, {
    ...parsed,
    rating: rating === undefined ? (current?.rating ?? null) : parsed.rating,
    notes: notes === undefined ? (current?.notes ?? null) : parsed.notes,
    videoUrl: current?.video_url ?? null,
  });
  revalidatePath("/shortlist");
  revalidatePath(`/players/${playerId}`);
}

export async function removeNoteAction(playerId: string) {
  const session = await requireSession();
  z.string().uuid().parse(playerId);
  await deleteNote(session.workspaceId, playerId);
  revalidatePath("/shortlist");
  revalidatePath(`/players/${playerId}`);
}

export async function loginAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const name = String(form.get("name") ?? "").trim();
  const code = String(form.get("passcode") ?? "");
  if (!name) return { ok: false, message: "Add meg a neved." };
  if (!process.env.WORKSPACE_PASSCODE || code !== process.env.WORKSPACE_PASSCODE) {
    return { ok: false, message: "Hibás belépési kód." };
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, sign({ workspaceId: DEFAULT_WORKSPACE, name }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(String(form.get("next") || "/"));
}

export async function logoutAction() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
