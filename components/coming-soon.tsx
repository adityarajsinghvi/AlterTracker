export function ComingSoon({ phase }: { phase: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
      Coming in {phase}.
    </p>
  );
}
