export function PageTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <header className="mb-5">
      <h1 className="text-2xl font-semibold">{children}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </header>
  );
}
