export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-8 w-40 animate-pulse motion-reduce:animate-none rounded-md bg-muted" />
        <div className="h-5 w-24 animate-pulse motion-reduce:animate-none rounded-full bg-muted" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-6">
            <div className="h-4 w-24 animate-pulse motion-reduce:animate-none rounded bg-muted" />
            <div className="mt-3 h-7 w-20 animate-pulse motion-reduce:animate-none rounded bg-muted" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-6">
            <div className="h-5 w-48 animate-pulse motion-reduce:animate-none rounded bg-muted" />
            <div className="mt-4 space-y-2">
              <div className="h-12 animate-pulse motion-reduce:animate-none rounded-md bg-muted" />
              <div className="h-12 animate-pulse motion-reduce:animate-none rounded-md bg-muted" />
              <div className="h-12 animate-pulse motion-reduce:animate-none rounded-md bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
