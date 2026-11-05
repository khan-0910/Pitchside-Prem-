import type { UseQueryResult } from "@tanstack/react-query";
import { CircleAlert, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import { ApiError } from "@/services/api";

export function Skeleton({ className = "h-5 w-full" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : "This data could not be loaded.";
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 border-l-2 border-alert py-3 pl-4">
      <CircleAlert aria-hidden className="size-5 text-alert" />
      <p className="min-w-0 flex-1 basis-60">{message}</p>
      {onRetry && (
        <button type="button" className="btn-ghost" onClick={onRetry}>
          <RotateCcw aria-hidden className="size-4" /> Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border-l-2 border-pitch py-3 pl-4">
      <p className="font-medium">{title}</p>
      {children && <div className="text-muted">{children}</div>}
    </div>
  );
}

interface DataStateProps<T> {
  query: UseQueryResult<T>;
  loading?: ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}

/** Every data view goes through here, so none can skip its loading, error or empty state. */
export function DataState<T>({ query, loading, isEmpty, empty, children }: DataStateProps<T>) {
  if (query.isPending) return <>{loading ?? <SkeletonRows />}</>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (isEmpty?.(query.data)) return <>{empty ?? <EmptyState title="Nothing to show yet." />}</>;
  return <>{children(query.data)}</>;
}
