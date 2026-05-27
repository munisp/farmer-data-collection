import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface ModernCardProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "elevated" | "glass" | "outline";
  padding?: "none" | "sm" | "md" | "lg";
  hover?: boolean;
}

export function ModernCard({
  children,
  className,
  variant = "default",
  padding = "md",
  hover = true,
}: ModernCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl transition-all duration-200",
        variant === "default" && "card-modern",
        variant === "elevated" && "card-elevated",
        variant === "glass" && "card-glass",
        variant === "outline" && "border border-border bg-transparent",
        padding === "none" && "p-0",
        padding === "sm" && "p-4",
        padding === "md" && "p-6",
        padding === "lg" && "p-8",
        hover && variant !== "outline" && "hover:shadow-md",
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function CardHeader({
  title,
  description,
  action,
  icon,
  className,
}: CardHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between mb-4", className)}>
      <div className="flex items-start gap-3">
        {icon && (
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
        )}
        <div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

interface CardContentProps {
  children: ReactNode;
  className?: string;
}

export function CardContent({ children, className }: CardContentProps) {
  return <div className={cn("", className)}>{children}</div>;
}

interface CardFooterProps {
  children: ReactNode;
  className?: string;
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between mt-4 pt-4 border-t border-border/50",
        className
      )}
    >
      {children}
    </div>
  );
}
