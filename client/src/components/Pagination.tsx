import { Button } from './ui/button';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  itemsPerPage: number;
  totalItems: number;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  itemsPerPage,
  totalItems,
}: PaginationProps) {
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      onPageChange(page);
    }
  };

  const renderPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show first page
      pages.push(1);

      if (currentPage > 3) {
        pages.push('...');
      }

      // Show pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push('...');
      }

      // Show last page
      pages.push(totalPages);
    }

    return pages.map((page, index) => {
      if (page === '...') {
        return (
          <span key={`ellipsis-${index}`} className="px-3 py-2 text-muted-foreground">
            ...
          </span>
        );
      }

      return (
        <Button
          key={page}
          variant={currentPage === page ? 'default' : 'outline'}
          size="sm"
          onClick={() => goToPage(page as number)}
          className="min-w-[40px]"
        >
          {page}
        </Button>
      );
    });
  };

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="text-sm text-muted-foreground">
        Showing {startItem} to {endItem} of {totalItems} items
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(1)}
          disabled={currentPage === 1}
          className="gap-1"
        >
          <ChevronsLeft className="h-4 w-4" />
          First
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Button>

        <div className="hidden sm:flex items-center gap-1">
          {renderPageNumbers()}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="gap-1"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(totalPages)}
          disabled={currentPage === totalPages}
          className="gap-1"
        >
          Last
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
