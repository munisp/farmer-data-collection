import { cn } from "@/lib/utils";
import { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
  trend?: {
    value: number;
    label?: string;
  };
  className?: string;
  variant?: "default" | "primary" | "accent";
}

export function StatsCard({
  title,
  value,
  description,
  icon,
  trend,
  className,
  variant = "default",
}: StatsCardProps) {
  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend.value > 0) return <TrendingUp className="w-3 h-3" />;
    if (trend.value < 0) return <TrendingDown className="w-3 h-3" />;
    return <Minus className="w-3 h-3" />;
  };

  const getTrendClass = () => {
    if (!trend) return "";
    if (trend.value > 0) return "positive";
    if (trend.value < 0) return "negative";
    return "";
  };

  return (
    <div
      className={cn(
        "stat-card animate-slide-up",
        variant === "primary" && "border-primary/20 bg-primary/5",
        variant === "accent" && "border-accent/20 bg-accent/5",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="stat-card-label">{title}</p>
          <p className="stat-card-value">{value}</p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
          {trend && (
            <div className={cn("stat-card-trend inline-flex items-center gap-1", getTrendClass())}>
              {getTrendIcon()}
              <span>{trend.value > 0 ? "+" : ""}{trend.value}%</span>
              {trend.label && <span className="text-muted-foreground ml-1">{trend.label}</span>}
            </div>
          )}
        </div>
        {icon && (
          <div
            className={cn(
              "p-3 rounded-xl",
              variant === "default" && "bg-muted text-muted-foreground",
              variant === "primary" && "bg-primary/10 text-primary",
              variant === "accent" && "bg-accent/10 text-accent-foreground"
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

interface StatsGridProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}

export function StatsGrid({ children, columns = 4, className }: StatsGridProps) {
  return (
    <div
      className={cn(
        "grid gap-4",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}
