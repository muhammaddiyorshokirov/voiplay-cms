import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && (
        <div className="w-full sm:w-auto [&>*]:w-full sm:[&>*]:w-auto [&>div]:flex [&>div]:w-full [&>div]:flex-wrap [&>div]:gap-2 sm:[&>div]:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
