// Shown instantly while the next screen loads, so every tap gives immediate feedback.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse space-y-4">
      <div className="h-8 w-2/3 rounded-lg bg-border" />
      <div className="h-14 rounded-xl bg-border/70" />
      <div className="h-28 rounded-xl bg-border/50" />
      <div className="h-28 rounded-xl bg-border/50" />
      <div className="h-28 rounded-xl bg-border/50" />
    </div>
  );
}
