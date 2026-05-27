import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Search, X } from "lucide-react";

export interface LoanFilterState {
  search: string;
  lenderId: string;
  status: string;
  minAmount: string;
  maxAmount: string;
  startDate: string;
  endDate: string;
}

interface LoanFiltersProps {
  filters: LoanFilterState;
  onFilterChange: (filters: LoanFilterState) => void;
  lenders?: Array<{ id: number; name: string }>;
  showLenderFilter?: boolean;
}

export default function LoanFilters({
  filters,
  onFilterChange,
  lenders = [],
  showLenderFilter = true,
}: LoanFiltersProps) {
  const updateFilter = (key: keyof LoanFilterState, value: string) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFilterChange({
      search: "",
      lenderId: "",
      status: "",
      minAmount: "",
      maxAmount: "",
      startDate: "",
      endDate: "",
    });
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== "");

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by loan number or purpose..."
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Lender Filter */}
            {showLenderFilter && (
              <div className="space-y-2">
                <Label>Lender</Label>
                <Select
                  value={filters.lenderId}
                  onValueChange={(value) => updateFilter("lenderId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All lenders" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All lenders</SelectItem>
                    {lenders.map((lender) => (
                      <SelectItem key={lender.id} value={lender.id.toString()}>
                        {lender.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Status Filter */}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={filters.status}
                onValueChange={(value) => updateFilter("status", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="disbursed">Disbursed</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="defaulted">Defaulted</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Min Amount */}
            <div className="space-y-2">
              <Label>Min Amount (₦)</Label>
              <Input
                type="number"
                placeholder="0"
                value={filters.minAmount}
                onChange={(e) => updateFilter("minAmount", e.target.value)}
              />
            </div>

            {/* Max Amount */}
            <div className="space-y-2">
              <Label>Max Amount (₦)</Label>
              <Input
                type="number"
                placeholder="Any"
                value={filters.maxAmount}
                onChange={(e) => updateFilter("maxAmount", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Start Date */}
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => updateFilter("startDate", e.target.value)}
              />
            </div>

            {/* End Date */}
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => updateFilter("endDate", e.target.value)}
              />
            </div>
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <X className="mr-2 h-4 w-4" />
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
