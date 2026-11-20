"use client";
import { useActionState } from "react";
import { loginAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="mt-6 space-y-4 rounded-lg border bg-card p-5">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-1.5">
        <Label htmlFor="name">Név</Label>
        <Input
          id="name"
          name="name"
          defaultValue={state?.name ?? ""}
          placeholder="pl. Kovács Gábor (pályaedző)"
          autoComplete="name"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="passcode">Belépési kód</Label>
        <Input id="passcode" name="passcode" type="password" autoFocus={Boolean(state?.name)} required />
      </div>
      {state && !state.ok && <p className="text-sm text-rose-400">{state.message}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Belépés…" : "Belépés"}
      </Button>
    </form>
  );
}
