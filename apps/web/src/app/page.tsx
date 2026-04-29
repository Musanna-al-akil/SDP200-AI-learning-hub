import { AuthGate } from "@/components/auth/auth-gate";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <AuthGate />
    </main>
  );
}
