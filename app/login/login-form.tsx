"use client";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const field =
  "h-12 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="mt-8 space-y-4">
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">Your name</label>
        <input id="name" name="name" type="text" autoComplete="username" autoCapitalize="words" autoCorrect="off"
          maxLength={60} defaultValue={state.name} required className={field} placeholder="e.g. Ramesh" />
      </div>
      <div>
        <label htmlFor="pin" className="mb-1 block text-sm font-medium">4-digit PIN</label>
        <input id="pin" name="pin" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
          autoComplete="current-password" required className={field} placeholder="••••" />
      </div>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending}
        className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-opacity active:opacity-80 disabled:opacity-60">
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
