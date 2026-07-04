export default function SecretariaLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-64 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />

      <div className="rounded-xl border bg-card p-6">
        <div className="h-5 w-40 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-md bg-muted motion-reduce:animate-none"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
