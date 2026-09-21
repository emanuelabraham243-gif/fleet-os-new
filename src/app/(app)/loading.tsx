export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true">
      <div className="h-8 w-2/3 rounded-lg bg-muted-soft" />
      <div className="h-24 rounded-2xl bg-muted-soft" />
      <div className="h-24 rounded-2xl bg-muted-soft" />
      <div className="h-24 rounded-2xl bg-muted-soft" />
    </div>
  );
}
