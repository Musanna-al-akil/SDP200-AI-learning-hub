import { AuthGate } from "@/components/auth/auth-gate";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-5 py-10 text-slate-950">
      <div className="w-full max-w-sm">
        <AuthGate />
      </div>
    </main>
  );
}
