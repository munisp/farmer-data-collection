/**
 * SmartAlex Design System
 * 
 * Shared components implementing the SmartAlex visual language:
 * - Teal gradient heroes and buttons
 * - Consistent KPI cards with trend indicators
 * - Unified page headers with icons
 * - Data tables with consistent styling
 * - Form dialogs with standard layout
 * - Empty states with illustrations
 */
import React, { ReactNode, useState } from 'react';

// ============================================================================
// DESIGN TOKENS
// ============================================================================

export const tokens = {
  colors: {
    primary: '#0d9488',       // teal-600
    primaryDark: '#0f766e',   // teal-700
    primaryLight: '#14b8a6',  // teal-500
    accent: '#f59e0b',        // amber-500
    success: '#10b981',       // emerald-500
    danger: '#ef4444',        // red-500
    warning: '#f59e0b',       // amber-500
    info: '#3b82f6',          // blue-500
    muted: '#6b7280',         // gray-500
    background: '#f9fafb',    // gray-50
    surface: '#ffffff',
    text: '#111827',          // gray-900
    textSecondary: '#6b7280', // gray-500
  },
  gradients: {
    hero: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 50%, #2dd4bf 100%)',
    button: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
    accent: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    card: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)',
  },
} as const;

// ============================================================================
// PAGE HEADER (replaces inconsistent h1/h2 patterns across 157 pages)
// ============================================================================

interface PageHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  variant?: 'hero' | 'compact';
}

export function PageHeader({ icon, title, subtitle, actions, variant = 'compact' }: PageHeaderProps) {
  if (variant === 'hero') {
    return (
      <div className="sa-hero rounded-2xl p-8 text-white mb-6" style={{ background: tokens.gradients.hero }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center text-2xl backdrop-blur-sm">
              {icon}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{title}</h1>
              {subtitle && <p className="text-teal-100 mt-1">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center text-teal-600">
          {icon}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-gray-500 text-sm">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

// ============================================================================
// KPI CARD (replaces 50+ different stat card implementations)
// ============================================================================

interface KpiCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: { value: number; label?: string };
  target?: string;
  color?: 'teal' | 'amber' | 'emerald' | 'red' | 'blue' | 'purple';
}

const kpiColorMap = {
  teal: 'bg-teal-50 text-teal-600',
  amber: 'bg-amber-50 text-amber-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  red: 'bg-red-50 text-red-600',
  blue: 'bg-blue-50 text-blue-600',
  purple: 'bg-purple-50 text-purple-600',
};

export function KpiCard({ label, value, icon, trend, target, color = 'teal' }: KpiCardProps) {
  return (
    <div className="sa-card bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {target && <p className="text-xs text-gray-400 mt-1">Target: {target}</p>}
        </div>
        {icon && (
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpiColorMap[color]}`}>
            {icon}
          </div>
        )}
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1">
          <span className={`text-sm font-medium ${trend.value >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}%
          </span>
          {trend.label && <span className="text-xs text-gray-400">{trend.label}</span>}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ACTION BUTTON (replaces inconsistent button patterns)
// ============================================================================

interface ActionButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  disabled?: boolean;
  type?: 'button' | 'submit';
}

export function ActionButton({ children, onClick, variant = 'primary', size = 'md', icon, disabled, type = 'button' }: ActionButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2.5 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-2',
  };

  const variantClasses = {
    primary: 'sa-btn-primary text-white focus:ring-teal-500 disabled:opacity-50',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500',
    outline: 'border-2 border-teal-600 text-teal-600 hover:bg-teal-50 focus:ring-teal-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]}`}
      style={variant === 'primary' ? { background: tokens.gradients.button } : undefined}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
}

// ============================================================================
// DATA TABLE (replaces 50+ different table patterns)
// ============================================================================

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  isLoading?: boolean;
}

export function DataTable<T extends Record<string, unknown>>({ columns, data, emptyMessage = 'No records found.', emptyIcon, isLoading }: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full mx-auto" />
        <p className="text-gray-500 mt-3">Loading...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  {emptyIcon && <div className="text-gray-300 mb-3 flex justify-center text-4xl">{emptyIcon}</div>}
                  <p className="text-gray-500">{emptyMessage}</p>
                </td>
              </tr>
            ) : (
              data.map((item, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-sm text-gray-700 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                    >
                      {col.render ? col.render(item) : String(item[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// PERIOD SELECTOR (replaces many date range selectors)
// ============================================================================

interface PeriodSelectorProps {
  periods: { key: string; label: string }[];
  selected: string;
  onSelect: (key: string) => void;
}

export function PeriodSelector({ periods, selected, onSelect }: PeriodSelectorProps) {
  return (
    <div className="inline-flex bg-gray-100 rounded-lg p-1">
      {periods.map((p) => (
        <button
          key={p.key}
          onClick={() => onSelect(p.key)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
            selected === p.key
              ? 'bg-teal-600 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// STATUS BADGE (replaces many status rendering patterns)
// ============================================================================

interface StatusBadgeProps {
  status: string;
  variant?: 'dot' | 'pill';
}

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-emerald-100 text-emerald-700',
  approved: 'bg-emerald-100 text-emerald-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  paid: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  draft: 'bg-gray-100 text-gray-700',
  review: 'bg-blue-100 text-blue-700',
  in_transit: 'bg-blue-100 text-blue-700',
  processing: 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-red-100 text-red-700',
  defaulted: 'bg-red-100 text-red-700',
  expired: 'bg-gray-100 text-gray-500',
};

export function StatusBadge({ status, variant = 'pill' }: StatusBadgeProps) {
  const colorClass = statusColors[status.toLowerCase()] || 'bg-gray-100 text-gray-700';
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  
  if (variant === 'dot') {
    const dotColor = colorClass.includes('emerald') ? 'bg-emerald-500' : colorClass.includes('amber') ? 'bg-amber-500' : colorClass.includes('red') ? 'bg-red-500' : colorClass.includes('blue') ? 'bg-blue-500' : 'bg-gray-400';
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className="text-sm text-gray-700">{label}</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

// ============================================================================
// DIALOG (replaces many inconsistent modal implementations)
// ============================================================================

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Dialog({ open, onClose, title, children, actions, size = 'md' }: DialogProps) {
  if (!open) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
        <div className={`relative bg-white rounded-2xl shadow-xl ${sizeClasses[size]} w-full p-6`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div>{children}</div>
          {actions && (
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// FORM FIELD (replaces many inconsistent input patterns)
// ============================================================================

interface FormFieldProps {
  label: string;
  name: string;
  type?: 'text' | 'number' | 'email' | 'date' | 'textarea' | 'select';
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  error?: string;
}

export function FormField({ label, name, type = 'text', value, onChange, placeholder, required, options, error }: FormFieldProps) {
  const inputClasses = `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all ${error ? 'border-red-300' : 'border-gray-300'}`;

  return (
    <div className="space-y-1">
      <label htmlFor={name} className="block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {type === 'select' && options ? (
        <select
          id={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClasses}
          required={required}
        >
          <option value="">Select...</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : type === 'textarea' ? (
        <textarea
          id={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClasses} min-h-[80px]`}
          placeholder={placeholder}
          required={required}
        />
      ) : (
        <input
          id={name}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClasses}
          placeholder={placeholder}
          required={required}
        />
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ============================================================================
// TAB NAVIGATION (replaces many inconsistent tab implementations)
// ============================================================================

interface Tab {
  key: string;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
}

interface TabNavProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

export function TabNav({ tabs, activeTab, onTabChange }: TabNavProps) {
  return (
    <div className="border-b border-gray-200 mb-6">
      <div className="flex gap-1 -mb-px">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`sa-tab px-4 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 ${
              activeTab === tab.key
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.badge !== undefined && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                activeTab === tab.key ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// SECTION CARD (replaces many wrapper patterns)
// ============================================================================

interface SectionCardProps {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function SectionCard({ title, subtitle, icon, children, actions, className = '' }: SectionCardProps) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 ${className}`}>
      {(title || actions) && (
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {icon && <span className="text-teal-600">{icon}</span>}
            <div>
              {title && <h3 className="font-semibold text-gray-900">{title}</h3>}
              {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
            </div>
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

// ============================================================================
// FILTER BAR (replaces many filter implementations)
// ============================================================================

interface FilterOption {
  key: string;
  label: string;
  count?: number;
}

interface FilterBarProps {
  filters: FilterOption[];
  selected: string;
  onSelect: (key: string) => void;
}

export function FilterBar({ filters, selected, onSelect }: FilterBarProps) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {filters.map((f) => (
        <button
          key={f.key}
          onClick={() => onSelect(f.key)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
            selected === f.key
              ? 'bg-teal-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {f.label}
          {f.count !== undefined && (
            <span className="ml-1 text-xs opacity-75">({f.count})</span>
          )}
        </button>
      ))}
    </div>
  );
}
