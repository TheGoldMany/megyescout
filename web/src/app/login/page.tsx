import { LoginForm } from "./login-form";
import { authConfigProblems, safeNextPath } from "@/lib/session";

export const metadata = { title: "Belépés" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const problems = authConfigProblems();
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-xl font-semibold">Stáb belépés</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A klub-széf jegyzetei csak a Lajosmizsei VLC stábja számára láthatók.
      </p>
      {problems.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800">
          <p className="font-medium">A belépés még nincs beállítva.</p>
          <p className="mt-1">
            Hiányzó környezeti változó a Vercel-projektben: {problems.join(", ")}. Beállítás után telepítsd újra az
            alkalmazást.
          </p>
        </div>
      )}
      <LoginForm next={safeNextPath(next)} />
    </div>
  );
}
