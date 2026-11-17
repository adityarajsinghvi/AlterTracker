import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold">Singhvi Readymades</h1>
      <p className="mt-1 text-muted">Alteration Tracker</p>
      {reason === "disabled" && (
        <p role="alert" className="mt-6 rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">
          This account is switched off. Please ask the owner.
        </p>
      )}
      <LoginForm />
    </main>
  );
}
