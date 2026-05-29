import { useMemo, useState, type ReactNode } from "react";
import { useLocalization } from "@/contexts/LocalizationContext";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle,
  Circle,
  Phone,
  Mail,
  CreditCard,
  MapPin,
  Camera,
  Shield,
  Loader2,
  ArrowRight,
  Lock,
} from "lucide-react";
import { toast } from "sonner";

type KycTier = "unverified" | "basic" | "standard" | "enhanced" | "premium";
type KycStatus = "pending" | "in_review" | "approved" | "rejected" | "expired" | "suspended";
type DocumentType = "national_id" | "passport" | "drivers_license" | "proof_of_address" | "selfie";

interface VerificationStep {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  requiredForTier: KycTier;
  completed: boolean;
}

interface TierInfo {
  tier: KycTier;
  name: string;
  description: string;
  features: string[];
  color: string;
}

const TIER_INFO: TierInfo[] = [
  {
    tier: "unverified",
    name: "Unverified",
    description: "Read-only platform access",
    features: ["View marketplace", "Browse products"],
    color: "bg-gray-500",
  },
  {
    tier: "basic",
    name: "Basic",
    description: "Phone verified",
    features: ["Buy products", "Basic wallet access"],
    color: "bg-blue-500",
  },
  {
    tier: "standard",
    name: "Standard",
    description: "Identity verified",
    features: ["Loan applications", "Higher transaction limits"],
    color: "bg-green-500",
  },
  {
    tier: "enhanced",
    name: "Enhanced",
    description: "Address verified",
    features: ["Premium credit flows", "Priority support"],
    color: "bg-purple-500",
  },
  {
    tier: "premium",
    name: "Premium",
    description: "Biometric verification complete",
    features: ["Highest limits", "Full compliance clearance"],
    color: "bg-yellow-500",
  },
];



export default function KycVerification() {
  const { formatCurrency } = useLocalization();
  const utils = trpc.useUtils();
  const { data, isLoading, refetch } = trpc.kyc.getProfile.useQuery();
  const profile = data?.profile;
  const documents = data?.documents || [];

  const [showPhoneDialog, setShowPhoneDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showIdDialog, setShowIdDialog] = useState(false);
  const [showAddressDialog, setShowAddressDialog] = useState(false);
  const [showBiometricDialog, setShowBiometricDialog] = useState(false);

  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [email, setEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [idType, setIdType] = useState<DocumentType>("national_id");
  const [idNumber, setIdNumber] = useState("");
  const [idFile, setIdFile] = useState<File | null>(null);
  const [addressLine, setAddressLine] = useState("");
  const [addressFile, setAddressFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [uploadNotes, setUploadNotes] = useState("");

  const refreshKyc = async () => {
    await Promise.all([
      refetch(),
      utils.kyc.getProfile.invalidate(),
    ]);
  };

  const sendPhoneOtp = trpc.kyc.sendPhoneOtp.useMutation({
    onSuccess: async (result) => {
      toast.success(result.message || "OTP sent to your phone");
      await refreshKyc();
    },
    onError: (error) => toast.error(error.message || "Unable to send phone OTP"),
  });

  const verifyPhoneOtp = trpc.kyc.verifyPhoneOtp.useMutation({
    onSuccess: async (result) => {
      toast.success(result.message || "Phone verified successfully");
      setShowPhoneDialog(false);
      setPhoneOtp("");
      await refreshKyc();
    },
    onError: (error) => toast.error(error.message || "Phone verification failed"),
  });

  const sendEmailOtp = trpc.kyc.sendEmailOtp.useMutation({
    onSuccess: async (result) => {
      toast.success(result.message || "OTP sent to your email");
      await refreshKyc();
    },
    onError: (error) => toast.error(error.message || "Unable to send email OTP"),
  });

  const verifyEmailOtp = trpc.kyc.verifyEmailOtp.useMutation({
    onSuccess: async (result) => {
      toast.success(result.message || "Email verified successfully");
      setShowEmailDialog(false);
      setEmailOtp("");
      await refreshKyc();
    },
    onError: (error) => toast.error(error.message || "Email verification failed"),
  });

  const uploadDocument = trpc.kyc.uploadDocument.useMutation({
    onSuccess: async (result) => {
      toast.success(result.message || "Document submitted for review");
      await refreshKyc();
    },
    onError: (error) => toast.error(error.message || "Document submission failed"),
  });

  const requestTierUpgrade = trpc.kyc.requestTierUpgrade.useMutation({
    onSuccess: (result) => toast.success(result.message || "Tier upgrade request submitted"),
    onError: (error) => toast.error(error.message || "Tier upgrade request failed"),
  });

  const verifications = useMemo(() => ({
    phone: profile?.phoneVerified ?? false,
    email: profile?.emailVerified ?? false,
    id: profile?.idVerified ?? false,
    address: profile?.addressVerified ?? false,
    biometric: profile?.biometricVerified ?? false,
  }), [profile]);

  const currentTier = (profile?.currentTier || "unverified") as KycTier;
  const currentStatus = (profile?.status || "pending") as KycStatus;
  const completedSteps = Object.values(verifications).filter(Boolean).length;
  const totalSteps = Object.keys(verifications).length;
  const progress = (completedSteps / totalSteps) * 100;

  const steps: VerificationStep[] = [
    {
      id: "phone",
      title: "Phone Verification",
      description: "Send and confirm a one-time password for your phone number.",
      icon: <Phone className="w-5 h-5" />,
      requiredForTier: "basic",
      completed: verifications.phone,
    },
    {
      id: "email",
      title: "Email Verification",
      description: "Confirm your email address with an OTP.",
      icon: <Mail className="w-5 h-5" />,
      requiredForTier: "standard",
      completed: verifications.email,
    },
    {
      id: "id",
      title: "Identity Document",
      description: "Submit an identity document for compliance review.",
      icon: <CreditCard className="w-5 h-5" />,
      requiredForTier: "standard",
      completed: verifications.id,
    },
    {
      id: "address",
      title: "Address Verification",
      description: "Provide proof of address for enhanced verification.",
      icon: <MapPin className="w-5 h-5" />,
      requiredForTier: "enhanced",
      completed: verifications.address,
    },
    {
      id: "biometric",
      title: "Biometric Verification",
      description: "Submit a selfie for identity matching and liveness review.",
      icon: <Camera className="w-5 h-5" />,
      requiredForTier: "premium",
      completed: verifications.biometric,
    },
  ];

  const submitDocument = async (
    documentType: DocumentType,
    file: File | null,
    extra: { documentNumber?: string; fileName?: string },
    targetTier: KycTier,
    closeDialog: () => void,
  ) => {
    if (!file) {
      toast.error("Please choose a file before submitting");
      return;
    }

    const fileUrl = URL.createObjectURL(file);
    await uploadDocument.mutateAsync({
      documentType,
      fileUrl,
      fileName: extra.fileName || file.name,
      fileSize: file.size,
      mimeType: file.type,
      documentNumber: extra.documentNumber,
      issuingCountry: "Kenya",
    });

    await requestTierUpgrade.mutateAsync({ targetTier });
    closeDialog();
  };

  const getTierBadge = (tier: KycTier) => {
    const match = TIER_INFO.find((item) => item.tier === tier);
    return <Badge className={match?.color || "bg-gray-500"}>{match?.name || tier}</Badge>;
  };

  const getStatusBadge = (status: KycStatus) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-600">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "suspended":
        return <Badge className="bg-orange-600">Suspended</Badge>;
      case "in_review":
        return <Badge className="bg-blue-600">In Review</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">KYC Verification</h1>
            <p className="text-muted-foreground mt-2">
              Complete your compliance steps to unlock financing, trading, and higher transaction limits.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {getTierBadge(currentTier)}
            {getStatusBadge(currentStatus)}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Verification Progress</CardTitle>
              <CardDescription>
                {completedSteps} of {totalSteps} compliance steps completed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={progress} className="h-3" />
              <div className="grid gap-3 md:grid-cols-2">
                {steps.map((step) => (
                  <div key={step.id} className="flex items-start gap-3 rounded-lg border p-4">
                    <div className={step.completed ? "text-green-600" : "text-muted-foreground"}>
                      {step.completed ? <CheckCircle className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{step.title}</div>
                        {getTierBadge(step.requiredForTier)}
                      </div>
                      <p className="text-sm text-muted-foreground">{step.description}</p>
                      {!step.completed && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (step.id === "phone") setShowPhoneDialog(true);
                            if (step.id === "email") setShowEmailDialog(true);
                            if (step.id === "id") setShowIdDialog(true);
                            if (step.id === "address") setShowAddressDialog(true);
                            if (step.id === "biometric") setShowBiometricDialog(true);
                          }}
                        >
                          Complete Step
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current Limits</CardTitle>
              <CardDescription>Active limits for your current compliance tier</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Daily</span>
                <span className="font-medium">{formatCurrency(profile?.limits.dailyLimit || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Monthly</span>
                <span className="font-medium">{formatCurrency(profile?.limits.monthlyLimit || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Single transaction</span>
                <span className="font-medium">{formatCurrency(profile?.limits.singleLimit || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Maximum loan</span>
                <span className="font-medium">{formatCurrency(profile?.limits.maxLoan || 0)}</span>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <Shield className="w-4 h-4" />
                  Next requirements
                </div>
                <div className="mt-2 space-y-1">
                  {(profile?.nextTierRequirements || ["No pending requirements"]).map((requirement) => (
                    <div key={requirement}>{requirement}</div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Submitted Documents</CardTitle>
            <CardDescription>Documents already submitted for compliance review</CardDescription>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                You have not submitted any KYC documents yet.
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((document) => (
                  <div key={document.id} className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-medium">{document.documentType.replace(/_/g, " ")}</div>
                      <div className="text-sm text-muted-foreground">
                        Uploaded {new Date(document.uploadedAt).toLocaleString()}
                      </div>
                    </div>
                    <Badge variant={document.status === "approved" ? "default" : document.status === "rejected" ? "destructive" : "secondary"}>
                      {document.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showPhoneDialog} onOpenChange={setShowPhoneDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Phone Verification</DialogTitle>
            <DialogDescription>Send and confirm an OTP to verify your phone number.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+254712345678" />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => sendPhoneOtp.mutate({ phoneNumber })} disabled={sendPhoneOtp.isPending} variant="outline">
                {sendPhoneOtp.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Send OTP
              </Button>
            </div>
            <div className="space-y-2">
              <Label>OTP Code</Label>
              <Input value={phoneOtp} onChange={(e) => setPhoneOtp(e.target.value)} placeholder="Enter 6-digit code" />
            </div>
            <Button onClick={() => verifyPhoneOtp.mutate({ phoneNumber, code: phoneOtp })} disabled={verifyPhoneOtp.isPending} className="w-full">
              {verifyPhoneOtp.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Verify Phone
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email Verification</DialogTitle>
            <DialogDescription>Send and confirm an OTP to verify your email address.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <Button onClick={() => sendEmailOtp.mutate({ email })} disabled={sendEmailOtp.isPending} variant="outline">
              {sendEmailOtp.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Send OTP
            </Button>
            <div className="space-y-2">
              <Label>OTP Code</Label>
              <Input value={emailOtp} onChange={(e) => setEmailOtp(e.target.value)} placeholder="Enter 6-digit code" />
            </div>
            <Button onClick={() => verifyEmailOtp.mutate({ email, code: emailOtp })} disabled={verifyEmailOtp.isPending} className="w-full">
              {verifyEmailOtp.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Verify Email
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showIdDialog} onOpenChange={setShowIdDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Identity Document Submission</DialogTitle>
            <DialogDescription>Submit your primary identity document for manual review.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>ID Type</Label>
              <Select value={idType} onValueChange={(value) => setIdType(value as DocumentType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ID type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="national_id">National ID</SelectItem>
                  <SelectItem value="passport">Passport</SelectItem>
                  <SelectItem value="drivers_license">Driver&apos;s License</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Document Number</Label>
              <Input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="Enter your ID number" />
            </div>
            <div className="space-y-2">
              <Label>Upload Document</Label>
              <Input type="file" onChange={(e) => setIdFile(e.target.files?.[0] || null)} />
            </div>
            <div className="space-y-2">
              <Label>Review Notes</Label>
              <Textarea value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} placeholder="Optional notes for the compliance team" />
            </div>
            <Button
              className="w-full"
              disabled={uploadDocument.isPending || requestTierUpgrade.isPending}
              onClick={() => submitDocument(idType, idFile, { documentNumber: idNumber }, "standard", () => setShowIdDialog(false))}
            >
              {(uploadDocument.isPending || requestTierUpgrade.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Submit ID for Review
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddressDialog} onOpenChange={setShowAddressDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Address Verification</DialogTitle>
            <DialogDescription>Submit proof of address to request enhanced KYC access.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Residential Address</Label>
              <Textarea value={addressLine} onChange={(e) => setAddressLine(e.target.value)} placeholder="Enter your current address" />
            </div>
            <div className="space-y-2">
              <Label>Proof of Address</Label>
              <Input type="file" onChange={(e) => setAddressFile(e.target.files?.[0] || null)} />
            </div>
            <Button
              className="w-full"
              disabled={uploadDocument.isPending || requestTierUpgrade.isPending}
              onClick={() => submitDocument("proof_of_address", addressFile, { documentNumber: addressLine || undefined }, "enhanced", () => setShowAddressDialog(false))}
            >
              {(uploadDocument.isPending || requestTierUpgrade.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Submit Address Proof
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showBiometricDialog} onOpenChange={setShowBiometricDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Biometric Verification</DialogTitle>
            <DialogDescription>Submit a selfie image for biometric review and premium-tier consideration.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground flex items-start gap-2">
              <Lock className="w-4 h-4 mt-0.5" />
              Your submitted selfie will be attached to your KYC profile for compliance review.
            </div>
            <div className="space-y-2">
              <Label>Selfie Image</Label>
              <Input type="file" accept="image/*" onChange={(e) => setSelfieFile(e.target.files?.[0] || null)} />
            </div>
            <Button
              className="w-full"
              disabled={uploadDocument.isPending || requestTierUpgrade.isPending}
              onClick={() => submitDocument("selfie", selfieFile, {}, "premium", () => setShowBiometricDialog(false))}
            >
              {(uploadDocument.isPending || requestTierUpgrade.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Submit Selfie for Review
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
