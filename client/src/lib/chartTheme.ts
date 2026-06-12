/**
 * Shared chart theme for consistent styling across all chart implementations.
 * Use these colors and config whether using recharts or chart.js.
 */

// Consistent color palette derived from CSS design tokens
export const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  // Extended palette for >5 series
  "#10b981", // emerald-500
  "#3b82f6", // blue-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
] as const;

// Named semantic colors
export const SEMANTIC_COLORS = {
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
  primary: "#10b981",
  secondary: "#6b7280",
} as const;

// Recharts-compatible theme
export const RECHARTS_THEME = {
  fontSize: 12,
  fontFamily: "Inter, system-ui, sans-serif",
  colors: CHART_COLORS,
  grid: {
    stroke: "hsl(var(--border))",
    strokeDasharray: "3 3",
  },
  axis: {
    stroke: "hsl(var(--muted-foreground))",
    fontSize: 11,
  },
  tooltip: {
    backgroundColor: "hsl(var(--card))",
    borderColor: "hsl(var(--border))",
    color: "hsl(var(--card-foreground))",
  },
} as const;

// Chart.js compatible theme (for pages still using chart.js)
export const CHARTJS_THEME = {
  colors: [
    "#10b981", "#3b82f6", "#f59e0b", "#ef4444",
    "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
  ],
  gridColor: "rgba(0, 0, 0, 0.06)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 12,
} as const;

export function getChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}
