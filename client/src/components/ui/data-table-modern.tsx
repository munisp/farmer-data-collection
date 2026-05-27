import { cn } from "@/lib/utils";
import { ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "./button";

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  className?: string;
  sortable?: boolean;
}

interface DataTableModernProps<T> {
  data: T[];
  columns: Column<T>[];
  className?: string;
  emptyMessage?: string;
  loading?: boolean;
  onRowClick?: (item: T) => void;
  keyExtractor: (item: T) => string | number;
}

export function DataTableModern<T>({
  data,
  columns,
  className,
  emptyMessage = "No data available",
  loading,
  onRowClick,
  keyExtractor,
}: DataTableModernProps<T>) {
  if (loading) {
    return (
      <div className={cn("card-modern overflow-hidden", className)}>
        <div className="table-modern">
          <table className="w-full">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className={col.className}>
                    <div className="skeleton-text w-20 h-4" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col.key}>
                      <div className="skeleton-text w-full h-4" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={cn("card-modern", className)}>
        <div className="empty-state">
          <p className="empty-state-description">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("card-modern overflow-hidden p-0", className)}>
      <div className="overflow-x-auto">
        <table className="table-modern">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={col.className}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr
                key={keyExtractor(item)}
                onClick={() => onRowClick?.(item)}
                className={cn(onRowClick && "cursor-pointer")}
              >
                {columns.map((col) => (
                  <td key={col.key} className={col.className}>
                    {col.render
                      ? col.render(item)
                      : (item as Record<string, unknown>)[col.key]?.toString()}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function TablePagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
}: PaginationProps) {
  return (
    <div className={cn("flex items-center justify-between mt-4", className)}>
      <p className="text-sm text-muted-foreground">
        Page {currentPage} of {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="h-8 w-8"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="h-8 w-8"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="h-8 w-8"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="h-8 w-8"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
