import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface LoadingSkeletonProps {
  type?: "card" | "table" | "list" | "form";
  count?: number;
}

/**
 * LoadingSkeleton component for showing loading states
 * Usage: <LoadingSkeleton type="table" count={5} />
 */
export function LoadingSkeleton({ type = "card", count = 3 }: LoadingSkeletonProps) {
  if (type === "table") {
    return (
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex gap-4 items-center">
            <div className="skeleton h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-3/4 rounded" />
              <div className="skeleton h-3 w-1/2 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "list") {
    return (
      <div className="space-y-2">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="skeleton h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (type === "form") {
    return (
      <div className="space-y-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="skeleton h-4 w-24 rounded" />
            <div className="skeleton h-10 w-full rounded-md" />
          </div>
        ))}
      </div>
    );
  }

  // Default: card type
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <div className="skeleton h-6 w-3/4 rounded mb-2" />
            <div className="skeleton h-4 w-1/2 rounded" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="skeleton h-4 w-full rounded" />
              <div className="skeleton h-4 w-5/6 rounded" />
              <div className="skeleton h-4 w-4/6 rounded" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * TableSkeleton component for table loading states
 */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-md border">
      <div className="p-4 border-b">
        <div className="flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-4 w-24 rounded" />
          ))}
        </div>
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="p-4 flex gap-4">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="skeleton h-4 flex-1 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
