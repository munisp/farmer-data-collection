import { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Circle, AlertCircle, Building2, User, CreditCard, MapPin, FileText } from "lucide-react";

type OnboardingStep = "business" | "identity" | "bank" | "address" | "documents" | "review";

const STEPS: { key: OnboardingStep; label: string; icon: React.ReactNode }[] = [
  { key: "business", label: "Business Info", icon: <Building2 className="w-4 h-4" /> },
  { key: "identity", label: "Identity (KYC)", icon: <User className="w-4 h-4" /> },
  { key: "bank", label: "Bank Account", icon: <CreditCard className="w-4 h-4" /> },
  { key: "address", label: "Address", icon: <MapPin className="w-4 h-4" /> },
  { key: "documents", label: "Documents", icon: <FileText className="w-4 h-4" /> },
  { key: "review", label: "Review & Submit", icon: <CheckCircle2 className="w-4 h-4" /> },
];

const NIGERIAN_BANKS = [
  { code: "044", name: "Access Bank" },
  { code: "023", name: "Citibank Nigeria" },
  { code: "063", name: "Diamond Bank" },
  { code: "050", name: "Ecobank Nigeria" },
  { code: "070", name: "Fidelity Bank" },
  { code: "011", name: "First Bank" },
  { code: "214", name: "First City Monument Bank" },
  { code: "058", name: "GTBank" },
  { code: "030", name: "Heritage Bank" },
  { code: "301", name: "Jaiz Bank" },
  { code: "082", name: "Keystone Bank" },
  { code: "076", name: "Polaris Bank" },
  { code: "221", name: "Stanbic IBTC" },
  { code: "068", name: "Standard Chartered" },
  { code: "232", name: "Sterling Bank" },
  { code: "032", name: "Union Bank" },
  { code: "033", name: "United Bank for Africa" },
  { code: "215", name: "Unity Bank" },
  { code: "035", name: "Wema Bank" },
  { code: "057", name: "Zenith Bank" },
];

const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue",
  "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT",
  "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi",
  "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo",
  "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
];

export default function DistributorOnboarding() {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("business");
  const [formData, setFormData] = useState({
    // Business
    businessName: "",
    registrationNumber: "",
    contactPerson: "",
    phoneNumber: "",
    email: "",
    warehouseAddress: "",
    warehouseCapacityKg: "",
    coverageRegions: [] as string[],
    // Identity
    ninNumber: "",
    bvnNumber: "",
    dateOfBirth: "",
    gender: "",
    nationality: "Nigerian",
    idDocumentType: "",
    idDocumentNumber: "",
    idDocumentExpiry: "",
    // Business KYC
    cacNumber: "",
    tinNumber: "",
    businessType: "",
    yearEstablished: "",
    numberOfEmployees: "",
    annualRevenueRange: "",
    directors: [{ name: "", nin: "", phone: "", role: "Director" }],
    // Bank Account
    bankName: "",
    bankCode: "",
    accountNumber: "",
    accountName: "",
    accountBvn: "",
    // Address
    residentialAddress: "",
    city: "",
    state: "",
    lgaDistrict: "",
    postalCode: "",
  });

  const kycStatus = trpc.distributorNetwork.getKycStatus.useQuery();
  const registerMutation = trpc.distributorNetwork.registerDistributor.useMutation();
  const submitKycMutation = trpc.distributorNetwork.submitKyc.useMutation();
  const submitForReviewMutation = trpc.distributorNetwork.submitKycForReview.useMutation();

  const updateField = (field: string, value: string | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleRegister = async () => {
    await registerMutation.mutateAsync({
      businessName: formData.businessName,
      registrationNumber: formData.registrationNumber || undefined,
      contactPerson: formData.contactPerson,
      phoneNumber: formData.phoneNumber,
      email: formData.email || undefined,
      warehouseAddress: formData.warehouseAddress,
      warehouseCapacityKg: formData.warehouseCapacityKg ? Number(formData.warehouseCapacityKg) : undefined,
      coverageRegions: formData.coverageRegions.length > 0 ? formData.coverageRegions : ["Lagos"],
    });
    setCurrentStep("identity");
    kycStatus.refetch();
  };

  const handleSubmitKyc = async () => {
    await submitKycMutation.mutateAsync({
      ninNumber: formData.ninNumber || undefined,
      bvnNumber: formData.bvnNumber || undefined,
      dateOfBirth: formData.dateOfBirth || undefined,
      gender: (formData.gender as "male" | "female" | "other") || undefined,
      nationality: formData.nationality || undefined,
      idDocumentType: (formData.idDocumentType as "passport" | "drivers_license" | "voters_card" | "nin_slip") || undefined,
      idDocumentNumber: formData.idDocumentNumber || undefined,
      idDocumentExpiry: formData.idDocumentExpiry || undefined,
      cacNumber: formData.cacNumber || undefined,
      tinNumber: formData.tinNumber || undefined,
      businessType: (formData.businessType as "sole_proprietorship" | "partnership" | "limited_company") || undefined,
      yearEstablished: formData.yearEstablished ? Number(formData.yearEstablished) : undefined,
      numberOfEmployees: formData.numberOfEmployees ? Number(formData.numberOfEmployees) : undefined,
      annualRevenueRange: (formData.annualRevenueRange as "under_1m" | "1m_10m" | "10m_50m" | "50m_100m" | "above_100m") || undefined,
      directors: formData.directors.filter(d => d.name).length > 0 ? formData.directors.filter(d => d.name) : undefined,
      bankName: formData.bankName || undefined,
      bankCode: formData.bankCode || undefined,
      accountNumber: formData.accountNumber || undefined,
      accountName: formData.accountName || undefined,
      accountBvn: formData.accountBvn || undefined,
      residentialAddress: formData.residentialAddress || undefined,
      city: formData.city || undefined,
      state: formData.state || undefined,
      lgaDistrict: formData.lgaDistrict || undefined,
      postalCode: formData.postalCode || undefined,
    });
    kycStatus.refetch();
  };

  const handleSubmitForReview = async () => {
    await handleSubmitKyc();
    await submitForReviewMutation.mutateAsync();
    kycStatus.refetch();
  };

  const stepIndex = STEPS.findIndex(s => s.key === currentStep);

  const getStepStatus = (stepKey: OnboardingStep) => {
    const idx = STEPS.findIndex(s => s.key === stepKey);
    if (idx < stepIndex) return "completed";
    if (idx === stepIndex) return "current";
    return "upcoming";
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto dark:bg-gray-900">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground dark:text-white">Distributor Onboarding</h1>
          <p className="text-muted-foreground dark:text-gray-400 mt-1">
            Complete your KYC verification to start receiving produce and earning commissions.
          </p>
        </div>

        {/* KYC Status Banner */}
        {kycStatus.data?.registered && (
          <Card className="mb-6 dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4 flex items-center gap-4">
              {kycStatus.data.kycStatus === "approved" && (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">KYC Approved — Level {kycStatus.data.kycLevel}</span>
                </div>
              )}
              {kycStatus.data.kycStatus === "submitted" && (
                <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-medium">KYC Under Review — Submitted {kycStatus.data.kycSubmittedAt ? new Date(kycStatus.data.kycSubmittedAt).toLocaleDateString() : ""}</span>
                </div>
              )}
              {kycStatus.data.kycStatus === "rejected" && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                    <AlertCircle className="w-5 h-5" />
                    <span className="font-medium">KYC Rejected</span>
                  </div>
                  {kycStatus.data.rejectionReasons && (
                    <ul className="text-sm text-red-500 ml-7 list-disc">
                      {(kycStatus.data.rejectionReasons as string[]).map((r: string, i: number) => <li key={i}>{r}</li>)}
                    </ul>
                  )}
                </div>
              )}
              {(kycStatus.data.kycStatus === "not_started" || kycStatus.data.kycStatus === "in_progress") && (
                <div className="flex items-center gap-4 w-full">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium dark:text-gray-300">Completion</span>
                      <span className="text-sm text-muted-foreground">{kycStatus.data.completionPercent}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${kycStatus.data.completionPercent}%` }} />
                    </div>
                  </div>
                  {kycStatus.data.missingFields.length > 0 && (
                    <p className="text-xs text-muted-foreground">Missing: {kycStatus.data.missingFields.join(", ")}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step Progress */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {STEPS.map((step) => {
            const status = getStepStatus(step.key);
            return (
              <button
                key={step.key}
                onClick={() => setCurrentStep(step.key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  status === "current" ? "bg-primary text-primary-foreground" :
                  status === "completed" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
                  "bg-muted text-muted-foreground dark:bg-gray-800 dark:text-gray-400"
                }`}
              >
                {status === "completed" ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                {step.icon}
                {step.label}
              </button>
            );
          })}
        </div>

        {/* Step Content */}
        {currentStep === "business" && (
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white">Business Information</CardTitle>
              <CardDescription className="dark:text-gray-400">Basic details about your distribution business</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">Business Name *</Label>
                  <Input value={formData.businessName} onChange={e => updateField("businessName", e.target.value)} placeholder="e.g. Lagos Fresh Produce Hub" className="dark:bg-gray-900 dark:border-gray-600" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">Registration Number (RC)</Label>
                  <Input value={formData.registrationNumber} onChange={e => updateField("registrationNumber", e.target.value)} placeholder="RC-2024-XXXXX" className="dark:bg-gray-900 dark:border-gray-600" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">Contact Person *</Label>
                  <Input value={formData.contactPerson} onChange={e => updateField("contactPerson", e.target.value)} placeholder="Full name" className="dark:bg-gray-900 dark:border-gray-600" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">Phone Number *</Label>
                  <Input value={formData.phoneNumber} onChange={e => updateField("phoneNumber", e.target.value)} placeholder="+234..." className="dark:bg-gray-900 dark:border-gray-600" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">Email</Label>
                  <Input type="email" value={formData.email} onChange={e => updateField("email", e.target.value)} placeholder="email@company.ng" className="dark:bg-gray-900 dark:border-gray-600" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">Warehouse Capacity (kg)</Label>
                  <Input type="number" value={formData.warehouseCapacityKg} onChange={e => updateField("warehouseCapacityKg", e.target.value)} placeholder="e.g. 500000" className="dark:bg-gray-900 dark:border-gray-600" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-gray-300">Warehouse Address *</Label>
                <Textarea value={formData.warehouseAddress} onChange={e => updateField("warehouseAddress", e.target.value)} placeholder="Full warehouse address" className="dark:bg-gray-900 dark:border-gray-600" />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-gray-300">Coverage Regions</Label>
                <div className="flex flex-wrap gap-2">
                  {NIGERIAN_STATES.slice(0, 12).map(state => (
                    <button
                      key={state}
                      onClick={() => {
                        const regions = formData.coverageRegions.includes(state)
                          ? formData.coverageRegions.filter(r => r !== state)
                          : [...formData.coverageRegions, state];
                        updateField("coverageRegions", regions);
                      }}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                        formData.coverageRegions.includes(state)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-input dark:bg-gray-900 dark:text-gray-300 dark:border-gray-600"
                      }`}
                    >
                      {state}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button onClick={handleRegister} disabled={!formData.businessName || !formData.contactPerson || !formData.phoneNumber || !formData.warehouseAddress || registerMutation.isPending}>
                  {registerMutation.isPending ? "Registering..." : "Save & Continue"}
                </Button>
              </div>
              {registerMutation.error && <p className="text-sm text-red-500">{registerMutation.error.message}</p>}
            </CardContent>
          </Card>
        )}

        {currentStep === "identity" && (
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white">Identity Verification (KYC)</CardTitle>
              <CardDescription className="dark:text-gray-400">Personal identification required for regulatory compliance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">NIN (National Identification Number) *</Label>
                  <Input value={formData.ninNumber} onChange={e => updateField("ninNumber", e.target.value)} placeholder="11-digit NIN" maxLength={11} className="dark:bg-gray-900 dark:border-gray-600" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">BVN (Bank Verification Number) *</Label>
                  <Input value={formData.bvnNumber} onChange={e => updateField("bvnNumber", e.target.value)} placeholder="11-digit BVN" maxLength={11} className="dark:bg-gray-900 dark:border-gray-600" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">Date of Birth</Label>
                  <Input type="date" value={formData.dateOfBirth} onChange={e => updateField("dateOfBirth", e.target.value)} className="dark:bg-gray-900 dark:border-gray-600" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">Gender</Label>
                  <Select value={formData.gender} onValueChange={v => updateField("gender", v)}>
                    <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">ID Document Type</Label>
                  <Select value={formData.idDocumentType} onValueChange={v => updateField("idDocumentType", v)}>
                    <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600"><SelectValue placeholder="Select document type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="passport">International Passport</SelectItem>
                      <SelectItem value="drivers_license">Driver&apos;s License</SelectItem>
                      <SelectItem value="voters_card">Voter&apos;s Card</SelectItem>
                      <SelectItem value="nin_slip">NIN Slip</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">ID Document Number</Label>
                  <Input value={formData.idDocumentNumber} onChange={e => updateField("idDocumentNumber", e.target.value)} placeholder="Document number" className="dark:bg-gray-900 dark:border-gray-600" />
                </div>
              </div>

              <div className="border-t pt-4 mt-4 dark:border-gray-700">
                <h3 className="font-medium mb-3 dark:text-white">Business Verification</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="dark:text-gray-300">CAC Number *</Label>
                    <Input value={formData.cacNumber} onChange={e => updateField("cacNumber", e.target.value)} placeholder="Corporate Affairs Commission reg" className="dark:bg-gray-900 dark:border-gray-600" />
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-gray-300">TIN (Tax ID)</Label>
                    <Input value={formData.tinNumber} onChange={e => updateField("tinNumber", e.target.value)} placeholder="Tax Identification Number" className="dark:bg-gray-900 dark:border-gray-600" />
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-gray-300">Business Type</Label>
                    <Select value={formData.businessType} onValueChange={v => updateField("businessType", v)}>
                      <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600"><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sole_proprietorship">Sole Proprietorship</SelectItem>
                        <SelectItem value="partnership">Partnership</SelectItem>
                        <SelectItem value="limited_company">Limited Company</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-gray-300">Year Established</Label>
                    <Input type="number" value={formData.yearEstablished} onChange={e => updateField("yearEstablished", e.target.value)} placeholder="e.g. 2015" className="dark:bg-gray-900 dark:border-gray-600" />
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-gray-300">Number of Employees</Label>
                    <Input type="number" value={formData.numberOfEmployees} onChange={e => updateField("numberOfEmployees", e.target.value)} placeholder="e.g. 25" className="dark:bg-gray-900 dark:border-gray-600" />
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-gray-300">Annual Revenue Range</Label>
                    <Select value={formData.annualRevenueRange} onValueChange={v => updateField("annualRevenueRange", v)}>
                      <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600"><SelectValue placeholder="Select range" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="under_1m">Under ₦1M</SelectItem>
                        <SelectItem value="1m_10m">₦1M - ₦10M</SelectItem>
                        <SelectItem value="10m_50m">₦10M - ₦50M</SelectItem>
                        <SelectItem value="50m_100m">₦50M - ₦100M</SelectItem>
                        <SelectItem value="above_100m">Above ₦100M</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep("business")} className="dark:border-gray-600 dark:text-gray-300">Back</Button>
                <Button onClick={() => setCurrentStep("bank")}>Continue to Bank Details</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === "bank" && (
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white">Bank Account Details</CardTitle>
              <CardDescription className="dark:text-gray-400">Where profit disbursements will be sent. Must match BVN holder.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">Bank Name *</Label>
                  <Select value={formData.bankCode} onValueChange={v => {
                    const bank = NIGERIAN_BANKS.find(b => b.code === v);
                    updateField("bankCode", v);
                    if (bank) updateField("bankName", bank.name);
                  }}>
                    <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600"><SelectValue placeholder="Select bank" /></SelectTrigger>
                    <SelectContent>
                      {NIGERIAN_BANKS.map(bank => (
                        <SelectItem key={bank.code} value={bank.code}>{bank.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">Account Number * (NUBAN 10-digit)</Label>
                  <Input value={formData.accountNumber} onChange={e => updateField("accountNumber", e.target.value)} placeholder="0123456789" maxLength={10} className="dark:bg-gray-900 dark:border-gray-600" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">Account Name *</Label>
                  <Input value={formData.accountName} onChange={e => updateField("accountName", e.target.value)} placeholder="Name on account" className="dark:bg-gray-900 dark:border-gray-600" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">Account BVN</Label>
                  <Input value={formData.accountBvn} onChange={e => updateField("accountBvn", e.target.value)} placeholder="BVN linked to this account" maxLength={11} className="dark:bg-gray-900 dark:border-gray-600" />
                </div>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mt-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-300">
                  <AlertCircle className="w-4 h-4 inline mr-1" />
                  Bank account must match your BVN. All profit disbursements will be sent to this account via direct bank transfer.
                </p>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep("identity")} className="dark:border-gray-600 dark:text-gray-300">Back</Button>
                <Button onClick={() => setCurrentStep("address")}>Continue to Address</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === "address" && (
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white">Address Verification</CardTitle>
              <CardDescription className="dark:text-gray-400">Residential and business address for verification</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-2">
                  <Label className="dark:text-gray-300">Residential Address *</Label>
                  <Textarea value={formData.residentialAddress} onChange={e => updateField("residentialAddress", e.target.value)} placeholder="Full street address" className="dark:bg-gray-900 dark:border-gray-600" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">City *</Label>
                  <Input value={formData.city} onChange={e => updateField("city", e.target.value)} placeholder="e.g. Ikeja" className="dark:bg-gray-900 dark:border-gray-600" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">State *</Label>
                  <Select value={formData.state} onValueChange={v => updateField("state", v)}>
                    <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600"><SelectValue placeholder="Select state" /></SelectTrigger>
                    <SelectContent>
                      {NIGERIAN_STATES.map(state => (
                        <SelectItem key={state} value={state}>{state}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">LGA / District</Label>
                  <Input value={formData.lgaDistrict} onChange={e => updateField("lgaDistrict", e.target.value)} placeholder="Local Government Area" className="dark:bg-gray-900 dark:border-gray-600" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-gray-300">Postal Code</Label>
                  <Input value={formData.postalCode} onChange={e => updateField("postalCode", e.target.value)} placeholder="e.g. 100001" className="dark:bg-gray-900 dark:border-gray-600" />
                </div>
              </div>
              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep("bank")} className="dark:border-gray-600 dark:text-gray-300">Back</Button>
                <Button onClick={() => setCurrentStep("documents")}>Continue to Documents</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === "documents" && (
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white">Document Upload</CardTitle>
              <CardDescription className="dark:text-gray-400">Upload supporting documents for verification</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { type: "id_front", label: "Government ID (Front)" },
                  { type: "id_back", label: "Government ID (Back)" },
                  { type: "cac_certificate", label: "CAC Certificate" },
                  { type: "tin_certificate", label: "TIN Certificate" },
                  { type: "utility_bill", label: "Utility Bill (Address proof)" },
                  { type: "warehouse_proof", label: "Warehouse Lease/Ownership" },
                  { type: "passport_photo", label: "Passport Photograph" },
                  { type: "bank_statement", label: "Recent Bank Statement" },
                ].map(doc => (
                  <div key={doc.type} className="border rounded-lg p-3 dark:border-gray-700">
                    <Label className="text-sm dark:text-gray-300">{doc.label}</Label>
                    <div className="mt-2 flex items-center gap-2">
                      <Input type="file" accept="image/*,.pdf" className="text-sm dark:bg-gray-900 dark:border-gray-600" disabled />
                      <span className="text-xs text-muted-foreground">PDF/Image</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground dark:text-gray-400 mt-2">
                Minimum 3 documents required for full KYC verification. Documents will be reviewed by our compliance team within 24-48 hours.
              </p>
              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep("address")} className="dark:border-gray-600 dark:text-gray-300">Back</Button>
                <Button onClick={() => setCurrentStep("review")}>Review & Submit</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === "review" && (
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white">Review & Submit</CardTitle>
              <CardDescription className="dark:text-gray-400">Verify all information before submitting for review</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm text-muted-foreground dark:text-gray-400">BUSINESS</h4>
                  <p className="dark:text-white">{formData.businessName || "—"}</p>
                  <p className="text-sm text-muted-foreground">RC: {formData.registrationNumber || "—"}</p>
                  <p className="text-sm text-muted-foreground">CAC: {formData.cacNumber || "—"}</p>
                  <p className="text-sm text-muted-foreground">TIN: {formData.tinNumber || "—"}</p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium text-sm text-muted-foreground dark:text-gray-400">IDENTITY</h4>
                  <p className="dark:text-white">NIN: {formData.ninNumber || "—"}</p>
                  <p className="text-sm text-muted-foreground">BVN: {formData.bvnNumber || "—"}</p>
                  <p className="text-sm text-muted-foreground">DOB: {formData.dateOfBirth || "—"}</p>
                  <p className="text-sm text-muted-foreground">ID: {formData.idDocumentType || "—"} {formData.idDocumentNumber}</p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium text-sm text-muted-foreground dark:text-gray-400">BANK ACCOUNT</h4>
                  <p className="dark:text-white">{formData.bankName || "—"}</p>
                  <p className="text-sm text-muted-foreground">Acct: {formData.accountNumber || "—"}</p>
                  <p className="text-sm text-muted-foreground">Name: {formData.accountName || "—"}</p>
                  <p className="text-sm text-muted-foreground">BVN: {formData.accountBvn || "—"}</p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium text-sm text-muted-foreground dark:text-gray-400">ADDRESS</h4>
                  <p className="dark:text-white">{formData.residentialAddress || "—"}</p>
                  <p className="text-sm text-muted-foreground">{formData.city}{formData.state ? `, ${formData.state}` : ""}</p>
                  <p className="text-sm text-muted-foreground">LGA: {formData.lgaDistrict || "—"}</p>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  By submitting, you confirm that all information provided is accurate and you consent to verification checks. Falsified information may result in permanent suspension from the platform.
                </p>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep("documents")} className="dark:border-gray-600 dark:text-gray-300">Back</Button>
                <Button onClick={handleSubmitForReview} disabled={submitForReviewMutation.isPending || submitKycMutation.isPending} className="bg-green-600 hover:bg-green-700">
                  {submitForReviewMutation.isPending || submitKycMutation.isPending ? "Submitting..." : "Submit for KYC Review"}
                </Button>
              </div>
              {submitForReviewMutation.error && <p className="text-sm text-red-500">{submitForReviewMutation.error.message}</p>}
              {submitKycMutation.error && <p className="text-sm text-red-500">{submitKycMutation.error.message}</p>}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
