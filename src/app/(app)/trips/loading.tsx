export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true">
      <div className="h-8 w-1/2 rounded-lg bg-muted-soft" />
      <div className="h-12 rounded-full bg-muted-soft" />
      <div className="h-44 rounded-2xl bg-muted-soft" />
      <div className="h-44 rounded-2xl bg-muted-soft" />
    </div>
  );
}
