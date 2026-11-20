import { LoginForm } from "./login-form";

export const metadata = { title: "Belépés" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-xl font-semibold">Stáb belépés</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A klub-széf jegyzetei csak a Lajosmizsei VLC stábja számára láthatók.
      </p>
      <LoginForm next={next?.startsWith("/") ? next : "/"} />
    </div>
  );
}
