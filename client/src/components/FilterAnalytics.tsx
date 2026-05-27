import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Clock, BarChart3 } from "lucide-react";
import { SavedFilter } from "./SavedFilters";

interface FilterAnalyticsProps {
  storageKey: string;
}

export function FilterAnalytics({ storageKey }: FilterAnalyticsProps) {
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);

  useEffect(() => {
    const loadFilters = () => {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          setSavedFilters(JSON.parse(stored));
        } catch (error) {
          console.error("Failed to parse saved filters:", error);
        }
      }
    };

    loadFilters();
    // Reload when storage changes
    window.addEventListener("storage", loadFilters);
    return () => window.removeEventListener("storage", loadFilters);
  }, [storageKey]);

  // Sort by usage count (most used first)
  const mostUsedFilters = [...savedFilters]
    .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
    .slice(0, 5);

  // Sort by last used (most recent first)
  const recentlyUsedFilters = [...savedFilters]
    .filter((f) => f.lastUsed)
    .sort((a, b) => new Date(b.lastUsed!).getTime() - new Date(a.lastUsed!).getTime())
    .slice(0, 5);

  const totalFilters = savedFilters.length;
  const totalUsage = savedFilters.reduce((sum, f) => sum + (f.usageCount || 0), 0);
  const avgUsage = totalFilters > 0 ? (totalUsage / totalFilters).toFixed(1) : "0";

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (totalFilters === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Filter Analytics
          </CardTitle>
          <CardDescription>No saved filters yet. Save a filter to see analytics.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Filter Analytics
        </CardTitle>
        <CardDescription>
          Track your filter usage patterns and identify your most valuable filter combinations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-muted p-4 rounded-lg">
            <div className="text-sm text-muted-foreground">Total Filters</div>
            <div className="text-2xl font-bold">{totalFilters}</div>
          </div>
          <div className="bg-muted p-4 rounded-lg">
            <div className="text-sm text-muted-foreground">Total Uses</div>
            <div className="text-2xl font-bold">{totalUsage}</div>
          </div>
          <div className="bg-muted p-4 rounded-lg">
            <div className="text-sm text-muted-foreground">Avg Uses per Filter</div>
            <div className="text-2xl font-bold">{avgUsage}</div>
          </div>
        </div>

        {/* Most Used Filters */}
        {mostUsedFilters.length > 0 && (
          <div>
            <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4" />
              Most Used Filters
            </h3>
            <div className="space-y-2">
              {mostUsedFilters.map((filter, index) => (
                <div
                  key={filter.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="w-6 h-6 flex items-center justify-center p-0">
                      {index + 1}
                    </Badge>
                    <span className="font-medium">{filter.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{filter.usageCount || 0} uses</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recently Used Filters */}
        {recentlyUsedFilters.length > 0 && (
          <div>
            <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4" />
              Recently Used
            </h3>
            <div className="space-y-2">
              {recentlyUsedFilters.map((filter) => (
                <div
                  key={filter.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <span className="font-medium">{filter.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {formatDate(filter.lastUsed!)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
