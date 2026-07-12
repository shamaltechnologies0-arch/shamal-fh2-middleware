import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  data: T[];
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
};

export function DataTable<T>({
  columns,
  data,
  isLoading = false,
  emptyTitle = "No records",
  emptyDescription,
  className,
}: DataTableProps<T>) {
  if (isLoading) {
    return <LoadingSkeleton rows={5} className={className} />;
  }

  if (!data.length) {
    return (
      <EmptyState title={emptyTitle} description={emptyDescription} className={className} />
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border text-sm", className)}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn("h-9 px-3 text-[11px] font-medium uppercase tracking-wide", col.className)}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={i} className="h-10">
              {columns.map((col) => (
                <TableCell key={col.key} className={cn("px-3 py-2 text-xs", col.className)}>
                  {col.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
