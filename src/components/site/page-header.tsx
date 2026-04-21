import { type ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="border-b border-border/40 bg-gradient-to-b from-card/30 to-transparent">
      <div className="container py-10 sm:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2 max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl text-balance font-display">
              {title}
            </h1>
            {description && (
              <p className="text-muted-foreground leading-relaxed text-pretty">{description}</p>
            )}
          </div>
          {actions ? <div className="shrink-0 flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}
