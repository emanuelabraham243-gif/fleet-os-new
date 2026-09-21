export default function VehiclesLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true">
      <div className="h-8 w-1/2 rounded-lg bg-muted-soft" />
      <div className="h-32 rounded-2xl bg-muted-soft" />
      <div className="h-32 rounded-2xl bg-muted-soft" />
      <div className="h-32 rounded-2xl bg-muted-soft" />
    </div>
  );
}
