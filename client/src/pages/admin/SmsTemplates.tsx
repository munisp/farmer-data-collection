import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Eye, Copy, CheckCircle, XCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

interface Template {
  id: number;
  name: string;
  type: string;
  subject?: string;
  body: string;
  variables: string;
  description?: string;
  isActive: boolean;
  isDefault: boolean;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export default function SmsTemplates() {
  const [selectedType, setSelectedType] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [previewVariables, setPreviewVariables] = useState<Record<string, string>>({});

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    type: "custom",
    subject: "",
    body: "",
    variables: [] as string[],
    description: "",
    isActive: true,
    isDefault: false,
  });

  // Queries
  const { data: templates = [], isLoading, refetch } = trpc.smsTemplates.list.useQuery(
    selectedType === "all" ? undefined : { type: selectedType }
  );

  const { data: templateTypes = [] } = trpc.smsTemplates.getTemplateTypes.useQuery();

  const { data: previewData, refetch: refetchPreview } = trpc.smsTemplates.preview.useQuery(
    {
      templateId: selectedTemplate?.id || 0,
      variables: previewVariables,
    },
    {
      enabled: false,
    }
  );

  // Mutations
  const createMutation = trpc.smsTemplates.create.useMutation({
    onSuccess: () => {
      toast.success("Template created successfully");
      setIsCreateDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create template");
    },
  });

  const updateMutation = trpc.smsTemplates.update.useMutation({
    onSuccess: () => {
      toast.success("Template updated successfully");
      setIsEditDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update template");
    },
  });

  const deleteMutation = trpc.smsTemplates.delete.useMutation({
    onSuccess: () => {
      toast.success("Template deleted successfully");
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete template");
    },
  });

  // Handlers
  const resetForm = () => {
    setFormData({
      name: "",
      type: "custom",
      subject: "",
      body: "",
      variables: [],
      description: "",
      isActive: true,
      isDefault: false,
    });
  };

  const handleCreate = () => {
    if (!formData.name || !formData.body) {
      toast.error("Please fill in all required fields");
      return;
    }
    createMutation.mutate(formData as any);
  };

  const handleEdit = (template: Template) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      type: template.type,
      subject: template.subject || "",
      body: template.body,
      variables: JSON.parse(template.variables),
      description: template.description || "",
      isActive: template.isActive,
      isDefault: template.isDefault,
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedTemplate) return;
    updateMutation.mutate({ id: selectedTemplate.id, ...formData } as any);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this template?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handlePreview = (template: Template) => {
    setSelectedTemplate(template);
    const vars = JSON.parse(template.variables);
    const initialVars: Record<string, string> = {};
    vars.forEach((v: string) => {
      initialVars[v] = "";
    });
    setPreviewVariables(initialVars);
    setIsPreviewDialogOpen(true);
  };

  const handleCopyTemplate = (template: Template) => {
    setFormData({
      name: `${template.name} (Copy)`,
      type: template.type,
      subject: template.subject || "",
      body: template.body,
      variables: JSON.parse(template.variables),
      description: template.description || "",
      isActive: true,
      isDefault: false,
    });
    setIsCreateDialogOpen(true);
  };

  const addVariable = () => {
    const varName = prompt("Enter variable name (e.g., borrowerName):");
    if (varName && !formData.variables.includes(varName)) {
      setFormData({ ...formData, variables: [...formData.variables, varName] });
    }
  };

  const removeVariable = (varName: string) => {
    setFormData({
      ...formData,
      variables: formData.variables.filter((v) => v !== varName),
    });
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">SMS Templates</h1>
          <p className="text-muted-foreground">
            Manage reusable SMS message templates with variable substitution
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              Create Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create SMS Template</DialogTitle>
              <DialogDescription>
                Create a reusable template with variable placeholders like {`{{borrowerName}}`}
              </DialogDescription>
            </DialogHeader>
            <TemplateForm
              formData={formData}
              setFormData={setFormData}
              templateTypes={templateTypes}
              addVariable={addVariable}
              removeVariable={removeVariable}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Tabs value={selectedType} onValueChange={setSelectedType}>
        <TabsList>
          <TabsTrigger value="all">All Templates</TabsTrigger>
                  {templateTypes.map((type: any) => (
            <TabsTrigger key={type.value} value={type.value}>
              {type.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={selectedType} className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Loading templates...
              </CardContent>
            </Card>
          ) : templates.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No templates found. Create your first template to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {templates.map((template: any) => (
                <Card key={template.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2">
                          {template.name}
                          {template.isDefault && (
                            <Badge variant="default">Default</Badge>
                          )}
                          {!template.isActive && (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </CardTitle>
                        <CardDescription>
                          {templateTypes.find((t: any) => t.value === template.type)?.label || template.type}
                        </CardDescription>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePreview(template)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyTemplate(template)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(template)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(template.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {template.description && (
                      <p className="text-sm text-muted-foreground">{template.description}</p>
                    )}
                    <div className="bg-muted p-3 rounded-md">
                      <p className="text-sm font-mono whitespace-pre-wrap">{template.body}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {JSON.parse(template.variables).map((v: string) => (
                        <Badge key={v} variant="outline">
                          {`{{${v}}}`}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Used {template.usageCount} times</span>
                      <span>{template.isActive ? <CheckCircle className="inline h-4 w-4 text-green-600" /> : <XCircle className="inline h-4 w-4 text-red-600" />}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit SMS Template</DialogTitle>
            <DialogDescription>
              Update template details and message content
            </DialogDescription>
          </DialogHeader>
          <TemplateForm
            formData={formData}
            setFormData={setFormData}
            templateTypes={templateTypes}
            addVariable={addVariable}
            removeVariable={removeVariable}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Updating..." : "Update Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preview Template</DialogTitle>
            <DialogDescription>
              Enter variable values to see the final message
            </DialogDescription>
          </DialogHeader>
          {selectedTemplate && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Variables</Label>
                {JSON.parse(selectedTemplate.variables).map((varName: string) => (
                  <div key={varName} className="flex items-center gap-2">
                    <Label className="w-32">{`{{${varName}}}`}</Label>
                    <Input
                      value={previewVariables[varName] || ""}
                      onChange={(e) =>
                        setPreviewVariables({
                          ...previewVariables,
                          [varName]: e.target.value,
                        })
                      }
                      placeholder={`Enter ${varName}`}
                    />
                  </div>
                ))}
              </div>
              <Button onClick={() => refetchPreview()}>Generate Preview</Button>
              {previewData && (
                <div className="space-y-2">
                  <Label>Preview</Label>
                  <div className="bg-muted p-4 rounded-md">
                    <p className="text-sm font-mono whitespace-pre-wrap">
                      {previewData.message}
                    </p>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Length: {previewData.length} characters</span>
                    <span>Segments: {previewData.segments} SMS</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Template Form Component
function TemplateForm({
  formData,
  setFormData,
  templateTypes,
  addVariable,
  removeVariable,
}: {
  formData: any;
  setFormData: (data: any) => void;
  templateTypes: any[];
  addVariable: () => void;
  removeVariable: (varName: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Template Name *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Payment Reminder - 3 Days"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="type">Template Type *</Label>
        <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {templateTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject">Subject (Optional)</Label>
        <Input
          id="subject"
          value={formData.subject}
          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
          placeholder="e.g., Payment Reminder"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="body">Message Body *</Label>
        <Textarea
          id="body"
          value={formData.body}
          onChange={(e) => setFormData({ ...formData, body: e.target.value })}
          placeholder="Use {{variableName}} for dynamic content"
          rows={6}
        />
        <p className="text-xs text-muted-foreground">
          {formData.body.length} characters • {Math.ceil(formData.body.length / 160)} SMS segments
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <Label>Variables</Label>
          <Button type="button" variant="outline" size="sm" onClick={addVariable}>
            <Plus className="h-3 w-3 mr-1" />
            Add Variable
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {formData.variables.map((varName: string) => (
            <Badge key={varName} variant="secondary" className="gap-1">
              {`{{${varName}}}`}
              <button
                type="button"
                onClick={() => removeVariable(varName)}
                className="ml-1 hover:text-destructive"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="When to use this template..."
          rows={2}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Switch
            id="isActive"
            checked={formData.isActive}
            onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
          />
          <Label htmlFor="isActive">Active</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="isDefault"
            checked={formData.isDefault}
            onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
          />
          <Label htmlFor="isDefault">Set as Default</Label>
        </div>
      </div>
    </div>
  );
}
