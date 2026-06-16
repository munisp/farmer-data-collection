import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
  badge?: ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}

export function PageHeader({
  title,
  description,
  children,
  className,
  badge,
  breadcrumbs,
}: PageHeaderProps) {
  return (
    <div className={cn("page-header animate-fade-in", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav role="navigation" aria-label="Navigation" className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          {breadcrumbs.map((crumb, index) => (
            <span key={index} className="flex items-center gap-2">
              {index > 0 && <span className="text-border">/</span>}
              {crumb.href ? (
                <a
                  href={crumb.href}
                  className="hover:text-foreground transition-colors"
                >
                  {crumb.label}
                </a>
              ) : (
                <span className="text-foreground">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="page-header-title">{title}</h1>
            {badge}
          </div>
          {description && (
            <p className="page-header-description">{description}</p>
          )}
        </div>
        {children && (
          <div className="flex items-center gap-3 flex-shrink-0">{children}</div>
        )}
      </div>
    </div>
  );
}

interface PageSectionProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}

export function PageSection({
  title,
  description,
  children,
  className,
  action,
}: PageSectionProps) {
  return (
    <section className={cn("page-section", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          <div>
            {title && <h2 className="page-section-title">{title}</h2>}
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
