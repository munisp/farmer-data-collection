/**
 * Farmer Onboarding Wizard
 * Guided step-by-step onboarding flow for new farmers
 */

import React, { useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  User, 
  MapPin, 
  Tractor, 
  CreditCard, 
  FileCheck, 
  ChevronRight, 
  ChevronLeft,
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { trpc } from '@/lib/trpc';

// Wizard step definitions
const WIZARD_STEPS = [
  { id: 'personal', title: 'Personal Info', icon: User, description: 'Basic information about you' },
  { id: 'location', title: 'Location', icon: MapPin, description: 'Where you live and farm' },
  { id: 'farm', title: 'Farm Details', icon: Tractor, description: 'Information about your farm' },
  { id: 'financial', title: 'Financial', icon: CreditCard, description: 'Banking and income details' },
  { id: 'documents', title: 'Documents', icon: FileCheck, description: 'Upload required documents' },
  { id: 'review', title: 'Review', icon: CheckCircle2, description: 'Review and submit' },
];

// Form data types
interface PersonalInfo {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  nationalId: string;
}

interface LocationInfo {
  country: string;
  region: string;
  district: string;
  village: string;
  address: string;
  coordinates: { lat: number; lng: number } | null;
}

interface FarmInfo {
  farmName: string;
  farmSize: number;
  farmSizeUnit: string;
  ownershipType: string;
  primaryCrops: string[];
  hasLivestock: boolean;
  livestockTypes: string[];
  hasIrrigation: boolean;
  irrigationType: string;
  farmingExperience: number;
}

interface FinancialInfo {
  bankName: string;
  accountNumber: string;
  mobileMoneyProvider: string;
  mobileMoneyNumber: string;
  monthlyIncome: number;
  incomeSource: string;
  hasExistingLoans: boolean;
  existingLoanAmount: number;
}

interface DocumentInfo {
  nationalIdPhoto: File | null;
  profilePhoto: File | null;
  farmPhoto: File | null;
  landDocument: File | null;
}

interface WizardData {
  personal: PersonalInfo;
  location: LocationInfo;
  farm: FarmInfo;
  financial: FinancialInfo;
  documents: DocumentInfo;
}

const initialData: WizardData = {
  personal: {
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    dateOfBirth: '',
    gender: '',
    nationalId: '',
  },
  location: {
    country: 'Kenya',
    region: '',
    district: '',
    village: '',
    address: '',
    coordinates: null,
  },
  farm: {
    farmName: '',
    farmSize: 0,
    farmSizeUnit: 'hectares',
    ownershipType: '',
    primaryCrops: [],
    hasLivestock: false,
    livestockTypes: [],
    hasIrrigation: false,
    irrigationType: '',
    farmingExperience: 0,
  },
  financial: {
    bankName: '',
    accountNumber: '',
    mobileMoneyProvider: '',
    mobileMoneyNumber: '',
    monthlyIncome: 0,
    incomeSource: '',
    hasExistingLoans: false,
    existingLoanAmount: 0,
  },
  documents: {
    nationalIdPhoto: null,
    profilePhoto: null,
    farmPhoto: null,
    landDocument: null,
  },
};

// Validation functions
const validatePersonal = (data: PersonalInfo): string[] => {
  const errors: string[] = [];
  if (!data.firstName.trim()) errors.push('First name is required');
  if (!data.lastName.trim()) errors.push('Last name is required');
  if (!data.phone.trim()) errors.push('Phone number is required');
  if (data.phone && !/^(\+?254|0)?[17]\d{8}$/.test(data.phone.replace(/\s/g, ''))) {
    errors.push('Invalid phone number format');
  }
  if (!data.nationalId.trim()) errors.push('National ID is required');
  if (!data.gender) errors.push('Gender is required');
  return errors;
};

const validateLocation = (data: LocationInfo): string[] => {
  const errors: string[] = [];
  if (!data.region) errors.push('Region is required');
  if (!data.district) errors.push('District is required');
  if (!data.village.trim()) errors.push('Village is required');
  return errors;
};

const validateFarm = (data: FarmInfo): string[] => {
  const errors: string[] = [];
  if (!data.farmName.trim()) errors.push('Farm name is required');
  if (data.farmSize <= 0) errors.push('Farm size must be greater than 0');
  if (!data.ownershipType) errors.push('Ownership type is required');
  if (data.primaryCrops.length === 0) errors.push('Select at least one crop');
  return errors;
};

const validateFinancial = (data: FinancialInfo): string[] => {
  const errors: string[] = [];
  if (!data.mobileMoneyProvider) errors.push('Mobile money provider is required');
  if (!data.mobileMoneyNumber.trim()) errors.push('Mobile money number is required');
  if (data.monthlyIncome <= 0) errors.push('Monthly income must be greater than 0');
  return errors;
};

const validateDocuments = (data: DocumentInfo): string[] => {
  const errors: string[] = [];
  if (!data.nationalIdPhoto) errors.push('National ID photo is required');
  if (!data.profilePhoto) errors.push('Profile photo is required');
  return errors;
};

export default function FarmerOnboardingWizard() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<WizardData>(initialData);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [farmerId, setFarmerId] = useState<string | null>(null);

  // Calculate progress
  const progress = ((currentStep + 1) / WIZARD_STEPS.length) * 100;

  // Update data for a specific section
  const updateData = useCallback(<K extends keyof WizardData>(
    section: K,
    updates: Partial<WizardData[K]>
  ) => {
    setData(prev => ({
      ...prev,
      [section]: { ...prev[section], ...updates },
    }));
    setErrors([]);
  }, []);

  // Validate current step
  const validateCurrentStep = (): boolean => {
    let stepErrors: string[] = [];
    
    switch (WIZARD_STEPS[currentStep].id) {
      case 'personal':
        stepErrors = validatePersonal(data.personal);
        break;
      case 'location':
        stepErrors = validateLocation(data.location);
        break;
      case 'farm':
        stepErrors = validateFarm(data.farm);
        break;
      case 'financial':
        stepErrors = validateFinancial(data.financial);
        break;
      case 'documents':
        stepErrors = validateDocuments(data.documents);
        break;
      case 'review':
        // All validations combined
        stepErrors = [
          ...validatePersonal(data.personal),
          ...validateLocation(data.location),
          ...validateFarm(data.farm),
          ...validateFinancial(data.financial),
          ...validateDocuments(data.documents),
        ];
        break;
    }

    setErrors(stepErrors);
    return stepErrors.length === 0;
  };

  // Navigation handlers
  const handleNext = () => {
    if (validateCurrentStep()) {
      if (currentStep < WIZARD_STEPS.length - 1) {
        setCurrentStep(prev => prev + 1);
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
      setErrors([]);
    }
  };

  const handleStepClick = (stepIndex: number) => {
    if (stepIndex < currentStep) {
      setCurrentStep(stepIndex);
      setErrors([]);
    }
  };

  // Get current location
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          updateData('location', {
            coordinates: {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            },
          });
        },
        (error) => {
          console.error('Error getting location:', error);
        }
      );
    }
  };

  // Handle file upload
  const handleFileUpload = (field: keyof DocumentInfo, file: File | null) => {
    updateData('documents', { [field]: file });
  };

  // Submit form
  const handleSubmit = async () => {
    if (!validateCurrentStep()) return;

    setIsSubmitting(true);
    try {
      // In production, this would call the API
      // const result = await trpc.farmers.create.mutate(data);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setFarmerId(`F${Date.now().toString().slice(-8)}`);
      setIsComplete(true);
    } catch (error) {
      setErrors(['Failed to submit registration. Please try again.']);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render step content
  const renderStepContent = () => {
    const step = WIZARD_STEPS[currentStep];

    switch (step.id) {
      case 'personal':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={data.personal.firstName}
                  onChange={(e) => updateData('personal', { firstName: e.target.value })}
                  placeholder="Enter first name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={data.personal.lastName}
                  onChange={(e) => updateData('personal', { lastName: e.target.value })}
                  placeholder="Enter last name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number *</Label>
              <Input
                id="phone"
                value={data.personal.phone}
                onChange={(e) => updateData('personal', { phone: e.target.value })}
                placeholder="+254 7XX XXX XXX"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email (Optional)</Label>
              <Input
                id="email"
                type="email"
                value={data.personal.email}
                onChange={(e) => updateData('personal', { email: e.target.value })}
                placeholder="email@example.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dob">Date of Birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={data.personal.dateOfBirth}
                  onChange={(e) => updateData('personal', { dateOfBirth: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender">Gender *</Label>
                <Select
                  value={data.personal.gender}
                  onValueChange={(value) => updateData('personal', { gender: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nationalId">National ID Number *</Label>
              <Input
                id="nationalId"
                value={data.personal.nationalId}
                onChange={(e) => updateData('personal', { nationalId: e.target.value })}
                placeholder="Enter national ID number"
              />
            </div>
          </div>
        );

      case 'location':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Select
                value={data.location.country}
                onValueChange={(value) => updateData('location', { country: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Kenya">Kenya</SelectItem>
                  <SelectItem value="Uganda">Uganda</SelectItem>
                  <SelectItem value="Tanzania">Tanzania</SelectItem>
                  <SelectItem value="Ghana">Ghana</SelectItem>
                  <SelectItem value="Nigeria">Nigeria</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="region">Region/County *</Label>
                <Select
                  value={data.location.region}
                  onValueChange={(value) => updateData('location', { region: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Central">Central</SelectItem>
                    <SelectItem value="Western">Western</SelectItem>
                    <SelectItem value="Eastern">Eastern</SelectItem>
                    <SelectItem value="Rift Valley">Rift Valley</SelectItem>
                    <SelectItem value="Nyanza">Nyanza</SelectItem>
                    <SelectItem value="Coast">Coast</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="district">District *</Label>
                <Input
                  id="district"
                  value={data.location.district}
                  onChange={(e) => updateData('location', { district: e.target.value })}
                  placeholder="Enter district"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="village">Village *</Label>
              <Input
                id="village"
                value={data.location.village}
                onChange={(e) => updateData('location', { village: e.target.value })}
                placeholder="Enter village name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Physical Address</Label>
              <Input
                id="address"
                value={data.location.address}
                onChange={(e) => updateData('location', { address: e.target.value })}
                placeholder="Enter physical address"
              />
            </div>

            <div className="space-y-2">
              <Label>GPS Coordinates</Label>
              <div className="flex gap-2">
                <Input
                  value={data.location.coordinates ? `${data.location.coordinates.lat.toFixed(6)}, ${data.location.coordinates.lng.toFixed(6)}` : ''}
                  placeholder="Tap button to get location"
                  readOnly
                />
                <Button type="button" variant="outline" onClick={getCurrentLocation}>
                  <MapPin className="h-4 w-4 mr-2" />
                  Get Location
                </Button>
              </div>
            </div>
          </div>
        );

      case 'farm':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="farmName">Farm Name *</Label>
              <Input
                id="farmName"
                value={data.farm.farmName}
                onChange={(e) => updateData('farm', { farmName: e.target.value })}
                placeholder="Enter farm name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="farmSize">Farm Size *</Label>
                <Input
                  id="farmSize"
                  type="number"
                  value={data.farm.farmSize || ''}
                  onChange={(e) => updateData('farm', { farmSize: parseFloat(e.target.value) || 0 })}
                  placeholder="Enter size"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="farmSizeUnit">Unit</Label>
                <Select
                  value={data.farm.farmSizeUnit}
                  onValueChange={(value) => updateData('farm', { farmSizeUnit: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hectares">Hectares</SelectItem>
                    <SelectItem value="acres">Acres</SelectItem>
                    <SelectItem value="sqm">Square Meters</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ownershipType">Ownership Type *</Label>
              <Select
                value={data.farm.ownershipType}
                onValueChange={(value) => updateData('farm', { ownershipType: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select ownership type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owned">Owned</SelectItem>
                  <SelectItem value="leased">Leased</SelectItem>
                  <SelectItem value="family">Family Land</SelectItem>
                  <SelectItem value="communal">Communal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Primary Crops *</Label>
              <div className="grid grid-cols-3 gap-2">
                {['Maize', 'Beans', 'Rice', 'Wheat', 'Sorghum', 'Vegetables', 'Coffee', 'Tea', 'Sugarcane'].map((crop) => (
                  <div key={crop} className="flex items-center space-x-2">
                    <Checkbox
                      id={crop}
                      checked={data.farm.primaryCrops.includes(crop)}
                      onCheckedChange={(checked) => {
                        const crops = checked
                          ? [...data.farm.primaryCrops, crop]
                          : data.farm.primaryCrops.filter(c => c !== crop);
                        updateData('farm', { primaryCrops: crops });
                      }}
                    />
                    <Label htmlFor={crop} className="text-sm">{crop}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="hasLivestock"
                  checked={data.farm.hasLivestock}
                  onCheckedChange={(checked) => updateData('farm', { hasLivestock: !!checked })}
                />
                <Label htmlFor="hasLivestock">I have livestock</Label>
              </div>
            </div>

            {data.farm.hasLivestock && (
              <div className="space-y-2">
                <Label>Livestock Types</Label>
                <div className="grid grid-cols-3 gap-2">
                  {['Cattle', 'Goats', 'Sheep', 'Poultry', 'Pigs', 'Fish'].map((type) => (
                    <div key={type} className="flex items-center space-x-2">
                      <Checkbox
                        id={type}
                        checked={data.farm.livestockTypes.includes(type)}
                        onCheckedChange={(checked) => {
                          const types = checked
                            ? [...data.farm.livestockTypes, type]
                            : data.farm.livestockTypes.filter(t => t !== type);
                          updateData('farm', { livestockTypes: types });
                        }}
                      />
                      <Label htmlFor={type} className="text-sm">{type}</Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="hasIrrigation"
                  checked={data.farm.hasIrrigation}
                  onCheckedChange={(checked) => updateData('farm', { hasIrrigation: !!checked })}
                />
                <Label htmlFor="hasIrrigation">I have irrigation</Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="experience">Years of Farming Experience</Label>
              <Input
                id="experience"
                type="number"
                value={data.farm.farmingExperience || ''}
                onChange={(e) => updateData('farm', { farmingExperience: parseInt(e.target.value) || 0 })}
                placeholder="Enter years"
              />
            </div>
          </div>
        );

      case 'financial':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mobileMoneyProvider">Mobile Money Provider *</Label>
              <Select
                value={data.financial.mobileMoneyProvider}
                onValueChange={(value) => updateData('financial', { mobileMoneyProvider: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="airtel">Airtel Money</SelectItem>
                  <SelectItem value="mtn">MTN Mobile Money</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mobileMoneyNumber">Mobile Money Number *</Label>
              <Input
                id="mobileMoneyNumber"
                value={data.financial.mobileMoneyNumber}
                onChange={(e) => updateData('financial', { mobileMoneyNumber: e.target.value })}
                placeholder="+254 7XX XXX XXX"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bankName">Bank Name (Optional)</Label>
                <Input
                  id="bankName"
                  value={data.financial.bankName}
                  onChange={(e) => updateData('financial', { bankName: e.target.value })}
                  placeholder="Enter bank name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accountNumber">Account Number</Label>
                <Input
                  id="accountNumber"
                  value={data.financial.accountNumber}
                  onChange={(e) => updateData('financial', { accountNumber: e.target.value })}
                  placeholder="Enter account number"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="monthlyIncome">Average Monthly Income *</Label>
              <Input
                id="monthlyIncome"
                type="number"
                value={data.financial.monthlyIncome || ''}
                onChange={(e) => updateData('financial', { monthlyIncome: parseFloat(e.target.value) || 0 })}
                placeholder="Enter amount"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="incomeSource">Primary Income Source</Label>
              <Select
                value={data.financial.incomeSource}
                onValueChange={(value) => updateData('financial', { incomeSource: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select income source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="farming">Farming</SelectItem>
                  <SelectItem value="livestock">Livestock</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="employment">Employment</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="hasExistingLoans"
                  checked={data.financial.hasExistingLoans}
                  onCheckedChange={(checked) => updateData('financial', { hasExistingLoans: !!checked })}
                />
                <Label htmlFor="hasExistingLoans">I have existing loans</Label>
              </div>
            </div>

            {data.financial.hasExistingLoans && (
              <div className="space-y-2">
                <Label htmlFor="existingLoanAmount">Total Existing Loan Amount</Label>
                <Input
                  id="existingLoanAmount"
                  type="number"
                  value={data.financial.existingLoanAmount || ''}
                  onChange={(e) => updateData('financial', { existingLoanAmount: parseFloat(e.target.value) || 0 })}
                  placeholder="Enter total amount"
                />
              </div>
            )}
          </div>
        );

      case 'documents':
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>National ID Photo *</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                {data.documents.nationalIdPhoto ? (
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span>{data.documents.nationalIdPhoto.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleFileUpload('nationalIdPhoto', null)}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Click to upload or drag and drop</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileUpload('nationalIdPhoto', e.target.files?.[0] || null)}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Profile Photo *</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                {data.documents.profilePhoto ? (
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span>{data.documents.profilePhoto.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleFileUpload('profilePhoto', null)}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <div className="flex flex-col items-center gap-2">
                      <Camera className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Take or upload a photo</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      capture="user"
                      className="hidden"
                      onChange={(e) => handleFileUpload('profilePhoto', e.target.files?.[0] || null)}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Farm Photo (Optional)</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                {data.documents.farmPhoto ? (
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span>{data.documents.farmPhoto.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleFileUpload('farmPhoto', null)}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <div className="flex flex-col items-center gap-2">
                      <Tractor className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Upload a photo of your farm</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => handleFileUpload('farmPhoto', e.target.files?.[0] || null)}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Land Ownership Document (Optional)</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                {data.documents.landDocument ? (
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span>{data.documents.landDocument.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleFileUpload('landDocument', null)}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <div className="flex flex-col items-center gap-2">
                      <FileCheck className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Upload title deed or lease agreement</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => handleFileUpload('landDocument', e.target.files?.[0] || null)}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
        );

      case 'review':
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="font-semibold">Personal Information</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Name:</span>
                <span>{data.personal.firstName} {data.personal.lastName}</span>
                <span className="text-muted-foreground">Phone:</span>
                <span>{data.personal.phone}</span>
                <span className="text-muted-foreground">National ID:</span>
                <span>{data.personal.nationalId}</span>
                <span className="text-muted-foreground">Gender:</span>
                <span className="capitalize">{data.personal.gender}</span>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold">Location</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Country:</span>
                <span>{data.location.country}</span>
                <span className="text-muted-foreground">Region:</span>
                <span>{data.location.region}</span>
                <span className="text-muted-foreground">District:</span>
                <span>{data.location.district}</span>
                <span className="text-muted-foreground">Village:</span>
                <span>{data.location.village}</span>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold">Farm Details</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Farm Name:</span>
                <span>{data.farm.farmName}</span>
                <span className="text-muted-foreground">Size:</span>
                <span>{data.farm.farmSize} {data.farm.farmSizeUnit}</span>
                <span className="text-muted-foreground">Ownership:</span>
                <span className="capitalize">{data.farm.ownershipType}</span>
                <span className="text-muted-foreground">Crops:</span>
                <span>{data.farm.primaryCrops.join(', ')}</span>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold">Financial Information</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Mobile Money:</span>
                <span className="capitalize">{data.financial.mobileMoneyProvider}</span>
                <span className="text-muted-foreground">Mobile Number:</span>
                <span>{data.financial.mobileMoneyNumber}</span>
                <span className="text-muted-foreground">Monthly Income:</span>
                <span>{data.financial.monthlyIncome.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold">Documents</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">National ID:</span>
                <span className="flex items-center gap-1">
                  {data.documents.nationalIdPhoto ? (
                    <><CheckCircle2 className="h-4 w-4 text-green-500" /> Uploaded</>
                  ) : (
                    <><AlertCircle className="h-4 w-4 text-red-500" /> Missing</>
                  )}
                </span>
                <span className="text-muted-foreground">Profile Photo:</span>
                <span className="flex items-center gap-1">
                  {data.documents.profilePhoto ? (
                    <><CheckCircle2 className="h-4 w-4 text-green-500" /> Uploaded</>
                  ) : (
                    <><AlertCircle className="h-4 w-4 text-red-500" /> Missing</>
                  )}
                </span>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Completion screen
  if (isComplete) {
    return (
      <div role="main" aria-label="Page content" className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Registration Complete!</CardTitle>
            <CardDescription>
              Welcome to AgriFinance. Your farmer ID is:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <span className="text-2xl font-mono font-bold">{farmerId}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              You will receive an SMS with your login details shortly.
            </p>
            <Button onClick={() => setLocation('/dashboard')} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Farmer Registration</h1>
          <p className="text-muted-foreground">Complete the steps below to register as a farmer</p>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <Progress value={progress} className="h-2 mb-4" />
          <div className="flex justify-between">
            {WIZARD_STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;
              
              return (
                <button
                  key={step.id}
                  onClick={() => handleStepClick(index)}
                  disabled={index > currentStep}
                  className={`flex flex-col items-center gap-1 ${
                    isActive ? 'text-primary' : isCompleted ? 'text-green-600' : 'text-muted-foreground'
                  } ${index <= currentStep ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    isActive ? 'bg-primary text-primary-foreground' : 
                    isCompleted ? 'bg-green-100 text-green-600' : 'bg-muted'
                  }`}>
                    {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <span className="text-xs hidden md:block">{step.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <Card>
          <CardHeader>
            <CardTitle>{WIZARD_STEPS[currentStep].title}</CardTitle>
            <CardDescription>{WIZARD_STEPS[currentStep].description}</CardDescription>
          </CardHeader>
          <CardContent>
            {errors.length > 0 && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc list-inside">
                    {errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {renderStepContent()}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          {currentStep === WIZARD_STEPS.length - 1 ? (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  Submit Registration
                  <CheckCircle2 className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          ) : (
            <Button onClick={handleNext}>
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
