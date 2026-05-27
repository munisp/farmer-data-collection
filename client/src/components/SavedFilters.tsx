import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Trash2, FolderOpen, Download, Upload } from "lucide-react";
import { toast } from "sonner";

export interface SavedFilter {
  id: string;
  name: string;
  filters: Record<string, any>;
  createdAt: string;
  lastUsed?: string;
  usageCount?: number;
}

interface SavedFiltersProps {
  storageKey: string; // e.g., "crops-saved-filters"
  currentFilters: Record<string, any>;
  onLoadFilter: (filters: Record<string, any>) => void;
}

export function SavedFilters({ storageKey, currentFilters, onLoadFilter }: SavedFiltersProps) {
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [selectedFilterId, setSelectedFilterId] = useState<string>("");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");

  // Load saved filters from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        setSavedFilters(JSON.parse(stored));
      } catch (error) {
        console.error("Failed to parse saved filters:", error);
      }
    }
  }, [storageKey]);

  // Save filters to localStorage whenever they change
  useEffect(() => {
    if (savedFilters.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(savedFilters));
    }
  }, [savedFilters, storageKey]);

  const handleSaveFilter = () => {
    if (!filterName.trim()) {
      toast.error("Please enter a filter name");
      return;
    }

    const newFilter: SavedFilter = {
      id: Date.now().toString(),
      name: filterName.trim(),
      filters: currentFilters,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      usageCount: 0,
    };

    setSavedFilters([...savedFilters, newFilter]);
    setFilterName("");
    setSaveDialogOpen(false);
    toast.success(`Filter "${newFilter.name}" saved successfully`);
  };

  const handleLoadFilter = (filterId: string) => {
    const filter = savedFilters.find((f) => f.id === filterId);
    if (filter) {
      // Update usage tracking
      const updatedFilters = savedFilters.map((f) =>
        f.id === filterId
          ? {
              ...f,
              lastUsed: new Date().toISOString(),
              usageCount: (f.usageCount || 0) + 1,
            }
          : f
      );
      setSavedFilters(updatedFilters);
      localStorage.setItem(storageKey, JSON.stringify(updatedFilters));
      
      onLoadFilter(filter.filters);
      setSelectedFilterId(filterId);
      toast.success(`Filter "${filter.name}" loaded`);
    }
  };

  const handleDeleteFilter = (filterId: string) => {
    const filter = savedFilters.find((f) => f.id === filterId);
    if (filter) {
      const updated = savedFilters.filter((f) => f.id !== filterId);
      setSavedFilters(updated);
      if (selectedFilterId === filterId) {
        setSelectedFilterId("");
      }
      toast.success(`Filter "${filter.name}" deleted`);
    }
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(savedFilters, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${storageKey}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${savedFilters.length} filters`);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string) as SavedFilter[];
        
        // Validate imported data
        if (!Array.isArray(imported)) {
          toast.error("Invalid file format: expected an array of filters");
          return;
        }

        // Validate each filter has required fields
        const isValid = imported.every(
          (f) => f.id && f.name && f.filters && f.createdAt
        );
        if (!isValid) {
          toast.error("Invalid filter format: missing required fields");
          return;
        }

        if (importMode === "replace") {
          setSavedFilters(imported);
          toast.success(`Replaced with ${imported.length} imported filters`);
        } else {
          // Merge: add imported filters with new IDs to avoid conflicts
          const merged = [
            ...savedFilters,
            ...imported.map((f) => ({
              ...f,
              id: `${Date.now()}-${Math.random()}`,
            })),
          ];
          setSavedFilters(merged);
          toast.success(`Merged ${imported.length} filters (total: ${merged.length})`);
        }
        setImportDialogOpen(false);
      } catch (error) {
        toast.error("Failed to parse JSON file");
      }
    };
    reader.readAsText(file);
    // Reset input
    event.target.value = "";
  };

  return (
    <div className="flex items-end gap-2">
      {/* Load Saved Filter */}
      {savedFilters.length > 0 && (
        <div className="flex-1">
          <Label htmlFor="saved-filter">Saved Filters</Label>
          <div className="flex gap-2">
            <Select value={selectedFilterId} onValueChange={handleLoadFilter}>
              <SelectTrigger id="saved-filter">
                <SelectValue placeholder="Load a saved filter..." />
              </SelectTrigger>
              <SelectContent>
                {savedFilters.map((filter) => (
                  <SelectItem key={filter.id} value={filter.id}>
                    <div className="flex items-center justify-between w-full">
                      <span>{filter.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedFilterId && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleDeleteFilter(selectedFilterId)}
                title="Delete selected filter"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Save Current Filter */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="icon" title="Save current filters">
            <Save className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Filter</DialogTitle>
            <DialogDescription>
              Save your current filter combination for quick access later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="filter-name">Filter Name</Label>
              <Input
                id="filter-name"
                placeholder="e.g., This Month Active Crops"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveFilter();
                  }
                }}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-2">Current Filters:</p>
              <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-40">
                {JSON.stringify(currentFilters, null, 2)}
              </pre>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveFilter}>Save Filter</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Export Button */}
      {savedFilters.length > 0 && (
        <Button
          variant="outline"
          size="icon"
          onClick={handleExport}
          title="Export all filters to JSON"
        >
          <Download className="h-4 w-4" />
        </Button>
      )}

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="icon" title="Import filters from JSON">
            <Upload className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Filters</DialogTitle>
            <DialogDescription>
              Import saved filters from a JSON file. Choose to merge with existing filters or replace them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Import Mode</Label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    value="merge"
                    checked={importMode === "merge"}
                    onChange={(e) => setImportMode(e.target.value as "merge" | "replace")}
                  />
                  <span className="text-sm">Merge (add to existing)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    value="replace"
                    checked={importMode === "replace"}
                    onChange={(e) => setImportMode(e.target.value as "merge" | "replace")}
                  />
                  <span className="text-sm">Replace (delete existing)</span>
                </label>
              </div>
            </div>
            <div>
              <Label htmlFor="import-file">Select JSON File</Label>
              <Input
                id="import-file"
                type="file"
                accept=".json"
                onChange={handleImport}
                className="cursor-pointer"
              />
            </div>
            {savedFilters.length > 0 && (
              <div className="text-sm text-muted-foreground">
                Current filters: {savedFilters.length}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
