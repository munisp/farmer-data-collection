import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

/**
 * EmptyState component for showing when no data is available
 * Usage:
 * <EmptyState
 *   icon={Users}
 *   title="No farmers yet"
 *   description="Get started by adding your first farmer"
 *   actionLabel="Add Farmer"
 *   onAction={() => navigate('/add-farmer')}
 * />
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: EmptyStateProps) {
  return (
    <Card className="border-dashed">
      <CardHeader className="text-center pb-4">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {(actionLabel || secondaryActionLabel) && (
        <CardContent className="flex flex-col sm:flex-row gap-2 justify-center">
          {actionLabel && onAction && (
            <Button onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <Button variant="outline" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/**
 * InlineEmptyState component for smaller empty states within sections
 */
export function InlineEmptyState({
  icon: Icon,
  message,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Icon className="h-12 w-12 text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground mb-4">{message}</p>
      {actionLabel && onAction && (
        <Button size="sm" variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
