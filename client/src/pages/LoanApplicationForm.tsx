import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { FileUp, CheckCircle2, ArrowLeft, ArrowRight, CreditCard, User, Briefcase, Sprout, FileText, ClipboardCheck, Check } from "lucide-react";
import { ModernCard } from "@/components/ui/modern-card";
import { cn } from "@/lib/utils";

/**
 * Multi-Step Loan Application Form
 * 
 * Steps:
 * 1. Loan Details (amount, purpose, term)
 * 2. Personal Information (name, email, phone, address)
 * 3. Employment & Income
 * 4. Farm Information (for farmers)
 * 5. Document Upload
 * 6. Review & Submit
 */

export default function LoanApplicationForm() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 6;

  // Form data
  const [formData, setFormData] = useState({
    // Step 1: Loan Details
    loanAmount: "",
    purpose: "",
    termMonths: "",

    // Step 2: Personal Information
    fullName: "",
    email: "",
    phone: "",
    address: "",

    // Step 3: Employment & Income
    employmentStatus: "",
    monthlyIncome: "",
    incomeSource: "",

    // Step 4: Farm Information
    farmSize: "",
    cropTypes: "",
    yearsOfFarming: "",

    // Step 5: Documents
    documents: [] as Array<{
      type: string;
      file: File;
      preview?: string;
    }>,
  });

  const submitApplication = trpc.loanApplication.submitApplication.useMutation({
    onSuccess: (data) => {
      toast.success(`Application submitted successfully! Application #${data.applicationNumber}`);
      setLocation("/my-applications");
    },
    onError: (error) => {
      toast.error(`Failed to submit application: ${error.message}`);
    },
  });

  const uploadDocument = trpc.loanApplication.uploadDocument.useMutation();

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (documentType: string, file: File | null) => {
    if (!file) return;

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/jpg", "application/pdf", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast.error("Only JPEG, PNG, PDF, and WebP files are allowed");
      return;
    }

    // Add to documents array
    setFormData((prev) => ({
      ...prev,
      documents: [
        ...prev.documents.filter((doc) => doc.type !== documentType),
        { type: documentType, file },
      ],
    }));

    toast.success(`${documentType} uploaded successfully`);
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        if (!formData.loanAmount || !formData.purpose || !formData.termMonths) {
          toast.error("Please fill in all loan details");
          return false;
        }
        if (parseInt(formData.loanAmount) < 1000 || parseInt(formData.loanAmount) > 1000000) {
          toast.error("Loan amount must be between ₦1,000 and ₦1,000,000");
          return false;
        }
        return true;

      case 2:
        if (!formData.fullName || !formData.email || !formData.phone || !formData.address) {
          toast.error("Please fill in all personal information");
          return false;
        }
        return true;

      case 3:
        if (!formData.employmentStatus) {
          toast.error("Please select employment status");
          return false;
        }
        return true;

      case 4:
        // Farm information is optional for non-farmers
        return true;

      case 5:
        if (formData.documents.length === 0) {
          toast.error("Please upload at least one document");
          return false;
        }
        return true;

      default:
        return true;
    }
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    try {
      // Submit application
      const result = await submitApplication.mutateAsync({
        loanAmount: parseInt(formData.loanAmount) * 100, // Convert to cents
        purpose: formData.purpose,
        termMonths: parseInt(formData.termMonths),
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        employmentStatus: formData.employmentStatus || undefined,
        monthlyIncome: formData.monthlyIncome ? parseInt(formData.monthlyIncome) * 100 : undefined,
        incomeSource: formData.incomeSource || undefined,
        farmSize: formData.farmSize || undefined,
        cropTypes: formData.cropTypes || undefined,
        yearsOfFarming: formData.yearsOfFarming ? parseInt(formData.yearsOfFarming) : undefined,
      });

      // Upload documents
      for (const doc of formData.documents) {
        const reader = new FileReader();
        reader.readAsDataURL(doc.file);
        await new Promise((resolve) => {
          reader.onload = async () => {
            const base64 = (reader.result as string).split(",")[1];
            await uploadDocument.mutateAsync({
              applicationId: result.applicationId,
              documentType: doc.type,
              fileName: doc.file.name,
              fileData: base64,
              mimeType: doc.file.type,
            });
            resolve(null);
          };
        });
      }
    } catch (error) {
      console.error("Application submission error:", error);
    }
  };

  const steps = [
    { number: 1, title: "Loan Details", icon: CreditCard },
    { number: 2, title: "Personal Info", icon: User },
    { number: 3, title: "Employment", icon: Briefcase },
    { number: 4, title: "Farm Info", icon: Sprout },
    { number: 5, title: "Documents", icon: FileText },
    { number: 6, title: "Review", icon: ClipboardCheck },
  ];

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-background">
      {/* Modern Header */}
      <div className="gradient-hero text-white py-10">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center animate-fade-in">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">Loan Application</h1>
            <p className="text-lg opacity-90">
              Complete your application in a few simple steps
            </p>
          </div>
        </div>
      </div>

      <div className="container py-8">
        <div className="max-w-3xl mx-auto">
          {/* Modern Step Indicator */}
          <div className="mb-8 -mt-16 relative z-10">
            <ModernCard variant="elevated" className="p-6">
              <div className="flex items-center justify-between">
                {steps.map((step, index) => {
                  const Icon = step.icon;
                  const isCompleted = currentStep > step.number;
                  const isCurrent = currentStep === step.number;
                  
                  return (
                    <div key={step.number} className="flex items-center">
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
                            isCompleted && "bg-success text-success-foreground",
                            isCurrent && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                            !isCompleted && !isCurrent && "bg-muted text-muted-foreground"
                          )}
                        >
                          {isCompleted ? (
                            <Check className="w-5 h-5" />
                          ) : (
                            <Icon className="w-5 h-5" />
                          )}
                        </div>
                        <span
                          className={cn(
                            "text-xs mt-2 font-medium hidden md:block",
                            isCurrent ? "text-primary" : "text-muted-foreground"
                          )}
                        >
                          {step.title}
                        </span>
                      </div>
                      {index < steps.length - 1 && (
                        <div
                          className={cn(
                            "w-8 md:w-16 h-0.5 mx-2",
                            currentStep > step.number ? "bg-success" : "bg-muted"
                          )}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </ModernCard>
          </div>

          {/* Form Content */}
          <ModernCard variant="default" className="animate-slide-up">
            <div className="space-y-6">
            {/* Step 1: Loan Details */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Loan Details</h3>
                <div>
                  <Label htmlFor="loanAmount">Loan Amount (₦)</Label>
                  <Input
                    id="loanAmount"
                    type="number"
                    value={formData.loanAmount}
                    onChange={(e) => handleInputChange("loanAmount", e.target.value)}
                    placeholder="e.g., 50000"
                  />
                </div>
                <div>
                  <Label htmlFor="termMonths">Loan Term (Months)</Label>
                  <Input
                    id="termMonths"
                    type="number"
                    value={formData.termMonths}
                    onChange={(e) => handleInputChange("termMonths", e.target.value)}
                    placeholder="e.g., 12"
                  />
                </div>
                <div>
                  <Label htmlFor="purpose">Purpose of Loan</Label>
                  <Textarea
                    id="purpose"
                    value={formData.purpose}
                    onChange={(e) => handleInputChange("purpose", e.target.value)}
                    placeholder="Describe how you will use the loan..."
                    rows={4}
                  />
                </div>
              </div>
            )}

            {/* Step 2: Personal Information */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Personal Information</h3>
                <div>
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={formData.fullName}
                    onChange={(e) => handleInputChange("fullName", e.target.value)}
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => handleInputChange("phone", e.target.value)}
                    placeholder="+234 XXX XXX XXXX"
                  />
                </div>
                <div>
                  <Label htmlFor="address">Residential Address</Label>
                  <Textarea
                    id="address"
                    value={formData.address}
                    onChange={(e) => handleInputChange("address", e.target.value)}
                    placeholder="Full address including city and state"
                    rows={3}
                  />
                </div>
              </div>
            )}

            {/* Step 3: Employment & Income */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Employment & Income</h3>
                <div>
                  <Label htmlFor="employmentStatus">Employment Status</Label>
                  <Select value={formData.employmentStatus} onValueChange={(value) => handleInputChange("employmentStatus", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select employment status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employed">Employed</SelectItem>
                      <SelectItem value="self-employed">Self-Employed</SelectItem>
                      <SelectItem value="farmer">Farmer</SelectItem>
                      <SelectItem value="business-owner">Business Owner</SelectItem>
                      <SelectItem value="unemployed">Unemployed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="monthlyIncome">Monthly Income (₦)</Label>
                  <Input
                    id="monthlyIncome"
                    type="number"
                    value={formData.monthlyIncome}
                    onChange={(e) => handleInputChange("monthlyIncome", e.target.value)}
                    placeholder="e.g., 100000"
                  />
                </div>
                <div>
                  <Label htmlFor="incomeSource">Income Source</Label>
                  <Textarea
                    id="incomeSource"
                    value={formData.incomeSource}
                    onChange={(e) => handleInputChange("incomeSource", e.target.value)}
                    placeholder="Describe your primary source of income"
                    rows={3}
                  />
                </div>
              </div>
            )}

            {/* Step 4: Farm Information */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Farm Information (Optional)</h3>
                <p className="text-sm text-muted-foreground">
                  If you are a farmer, please provide farm details. Otherwise, skip to the next step.
                </p>
                <div>
                  <Label htmlFor="farmSize">Farm Size (Hectares)</Label>
                  <Input
                    id="farmSize"
                    value={formData.farmSize}
                    onChange={(e) => handleInputChange("farmSize", e.target.value)}
                    placeholder="e.g., 5"
                  />
                </div>
                <div>
                  <Label htmlFor="cropTypes">Crop Types</Label>
                  <Input
                    id="cropTypes"
                    value={formData.cropTypes}
                    onChange={(e) => handleInputChange("cropTypes", e.target.value)}
                    placeholder="e.g., Maize, Rice, Cassava"
                  />
                </div>
                <div>
                  <Label htmlFor="yearsOfFarming">Years of Farming Experience</Label>
                  <Input
                    id="yearsOfFarming"
                    type="number"
                    value={formData.yearsOfFarming}
                    onChange={(e) => handleInputChange("yearsOfFarming", e.target.value)}
                    placeholder="e.g., 10"
                  />
                </div>
              </div>
            )}

            {/* Step 5: Document Upload */}
            {currentStep === 5 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Document Upload</h3>
                <p className="text-sm text-muted-foreground">
                  Upload required documents (max 10MB per file, JPEG/PNG/PDF only)
                </p>

                {["id_card", "proof_of_address", "bank_statement", "income_proof"].map((docType) => (
                  <div key={docType} className="border rounded-lg p-4">
                    <Label htmlFor={docType} className="capitalize">
                      {docType.replace(/_/g, " ")}
                      {docType === "id_card" || docType === "proof_of_address" ? " *" : ""}
                    </Label>
                    <div className="mt-2">
                      <Input
                        id={docType}
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => handleFileChange(docType, e.target.files?.[0] || null)}
                      />
                      {formData.documents.find((doc) => doc.type === docType) && (
                        <p className="text-sm text-green-600 mt-2 flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4" />
                          {formData.documents.find((doc) => doc.type === docType)?.file.name}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Step 6: Review & Submit */}
            {currentStep === 6 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Review & Submit</h3>
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <span className="font-semibold">Loan Amount:</span>
                    <span>₦{parseInt(formData.loanAmount || "0").toLocaleString()}</span>

                    <span className="font-semibold">Term:</span>
                    <span>{formData.termMonths} months</span>

                    <span className="font-semibold">Full Name:</span>
                    <span>{formData.fullName}</span>

                    <span className="font-semibold">Email:</span>
                    <span>{formData.email}</span>

                    <span className="font-semibold">Phone:</span>
                    <span>{formData.phone}</span>

                    <span className="font-semibold">Employment:</span>
                    <span className="capitalize">{formData.employmentStatus}</span>

                    <span className="font-semibold">Documents:</span>
                    <span>{formData.documents.length} uploaded</span>
                  </div>

                  <div className="mt-4">
                    <span className="font-semibold">Purpose:</span>
                    <p className="mt-1">{formData.purpose}</p>
                  </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
                  <p className="text-sm text-yellow-800">
                    By submitting this application, you confirm that all information provided is accurate and complete.
                  </p>
                </div>
              </div>
            )}

              {/* Navigation Buttons */}
              <div className="flex justify-between pt-6 border-t border-border/50">
                <Button variant="outline" onClick={prevStep} disabled={currentStep === 1} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Previous
                </Button>

                {currentStep < totalSteps ? (
                  <Button onClick={nextStep} className="gap-2 btn-glow">
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button onClick={handleSubmit} disabled={submitApplication.isPending} className="gap-2 btn-glow">
                    {submitApplication.isPending ? "Submitting..." : "Submit Application"}
                    <FileUp className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </ModernCard>
        </div>
      </div>
    </div>
  );
}
