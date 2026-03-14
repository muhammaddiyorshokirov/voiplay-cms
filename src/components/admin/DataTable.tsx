import { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  loading,
  emptyMessage = "Ma'lumot topilmadi",
  onRowClick,
}: DataTableProps<T>) {
  const renderCellValue = (item: T, col: Column<T>) =>
    col.render ? col.render(item) : String(item[col.key] ?? "—");

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="flex h-48 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 md:hidden">
        {data.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          data.map((item, idx) => (
            <div
              key={item.id || idx}
              onClick={() => onRowClick?.(item)}
              className={`rounded-xl border border-border bg-card p-4 shadow-sm ${onRowClick ? "cursor-pointer transition-colors hover:bg-muted/30" : ""}`}
            >
              <div className="space-y-3">
                {columns.map((col) => (
                  <div key={col.key} className="space-y-1">
                    {col.header ? (
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {col.header}
                      </p>
                    ) : null}
                    <div className="text-sm text-foreground">
                      {renderCellValue(item, col)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {columns.map((col) => (
                <TableHead key={col.key} className={`font-heading text-xs font-semibold text-muted-foreground uppercase tracking-wider ${col.className || ""}`}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-48 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              data.map((item, idx) => (
                <TableRow
                  key={item.id || idx}
                  onClick={() => onRowClick?.(item)}
                  className={`border-border ${onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}`}
                >
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {renderCellValue(item, col)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
