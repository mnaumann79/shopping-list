export default function DashboardLoading() {
  return (
    <div className="bg-background min-h-screen">
      <header className="border-b border-border bg-background px-4 flex items-center justify-between min-h-13">
        <div className="h-4 w-28 rounded bg-muted animate-pulse" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
          <div className="h-8 w-8 rounded bg-muted animate-pulse" />
          <div className="h-8 w-8 rounded bg-muted animate-pulse" />
        </div>
      </header>
      <main>
        <div className="border-b px-4 py-3">
          <div className="h-10 rounded-xl bg-muted animate-pulse" />
        </div>
        <div className="border-b px-4 py-3 flex gap-2">
          <div className="h-8 w-20 rounded-full bg-muted animate-pulse" />
          <div className="h-8 w-16 rounded-full bg-muted animate-pulse" />
        </div>
        <div className="p-4 space-y-1">
          {[55, 70, 45, 65, 50].map((w, i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <div className="h-5 w-5 rounded border-2 border-muted bg-muted animate-pulse shrink-0" />
              <div className="h-4 rounded bg-muted animate-pulse" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
