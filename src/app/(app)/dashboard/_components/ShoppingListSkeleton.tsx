export function ShoppingListSkeleton() {
  return (
    <div className="pb-48 animate-pulse">
      {/* QuickAddBar skeleton */}
      <div className="h-14 border-b px-4" />

      {/* Store filter skeleton */}
      <div className="border-b px-4 py-3">
        <div className="flex gap-2">
          <div className="h-8 w-20 rounded-full bg-muted" />
          <div className="h-8 w-16 rounded-full bg-muted" />
        </div>
      </div>

      {/* List skeleton */}
      <div className="space-y-4 p-4">
        {["Category 1", "Category 2"].map((category) => (
          <div key={category}>
            <div className="py-2">
              <div className="h-4 w-24 rounded bg-muted" />
            </div>
            <div className="divide-y">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  <div className="h-5 w-5 rounded bg-muted" />
                  <div className="h-5 flex-1 rounded bg-muted" />
                  <div className="h-5 w-16 rounded bg-muted" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}