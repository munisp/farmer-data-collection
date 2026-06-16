/**
 * Post-Harvest Loss Reduction Service
 * Manages storage facilities, cold chain logistics, and quality grading
 * Integrates with marketplace and logistics services
 */

import { db } from "../db.js";
import { BoundedMap } from "../cache/bounded-map.js";
import { publishEvent, createEvent, getProducer } from "../kafka.js";
import { logger } from '../logger.js';
const kafkaProducer = { send: async (payload: Record<string, any>) => { const p = await getProducer(); if (p) return p.send(payload as any); } };

export type StorageType = 
  | 'hermetic_bags'
  | 'metal_silo'
  | 'warehouse'
  | 'cold_storage'
  | 'evaporative_cooler'
  | 'traditional'
  | 'improved_crib';

export type CropCategory = 
  | 'grains'
  | 'tubers'
  | 'fruits'
  | 'vegetables'
  | 'legumes'
  | 'oilseeds';

export interface StorageFacility {
  id: string;
  name: string;
  type: StorageType;
  location: { latitude: number; longitude: number; address: string };
  capacity: number; // tons
  availableCapacity: number;
  suitableCrops: CropCategory[];
  temperatureRange?: { min: number; max: number };
  humidityRange?: { min: number; max: number };
  pricePerTonPerDay: number;
  currency: string;
  amenities: string[];
  certifications: string[];
  rating: number;
  contactPhone: string;
  operatingHours: string;
  minimumBookingDays: number;
}

export interface StorageBooking {
  id: string;
  farmerId: number;
  facilityId: string;
  facilityName: string;
  cropName: string;
  quantity: number; // tons
  startDate: Date;
  endDate: Date;
  totalCost: number;
  status: 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled';
  qualityAtEntry?: QualityAssessment;
  qualityAtExit?: QualityAssessment;
  lossPercentage?: number;
}

export interface QualityAssessment {
  id: string;
  cropName: string;
  assessmentDate: Date;
  grade: 'A' | 'B' | 'C' | 'D' | 'Reject';
  moistureContent: number;
  foreignMatter: number;
  damagedGrains: number;
  discoloration: number;
  pestInfestation: boolean;
  moldPresence: boolean;
  overallScore: number;
  recommendations: string[];
  photos?: string[];
}

export interface ColdChainProvider {
  id: string;
  name: string;
  serviceArea: string[];
  vehicleTypes: VehicleType[];
  temperatureCapabilities: { min: number; max: number };
  pricePerKmPerTon: number;
  currency: string;
  rating: number;
  certifications: string[];
  contactPhone: string;
  trackingAvailable: boolean;
}

export interface VehicleType {
  type: string;
  capacity: number; // tons
  temperatureControlled: boolean;
  available: number;
}

export interface LogisticsBooking {
  id: string;
  farmerId: number;
  providerId: string;
  providerName: string;
  cropName: string;
  quantity: number;
  pickupLocation: { latitude: number; longitude: number; address: string };
  deliveryLocation: { latitude: number; longitude: number; address: string };
  pickupDate: Date;
  estimatedDeliveryDate: Date;
  actualDeliveryDate?: Date;
  temperatureRequired?: number;
  totalCost: number;
  status: 'pending' | 'confirmed' | 'in_transit' | 'delivered' | 'cancelled';
  trackingId?: string;
  temperatureLog?: TemperatureReading[];
}

export interface TemperatureReading {
  timestamp: Date;
  temperature: number;
  location: { latitude: number; longitude: number };
  alert?: string;
}

export interface PackagingRecommendation {
  cropName: string;
  recommendedPackaging: PackagingOption[];
  handlingInstructions: string[];
  stackingLimit: number;
  shelfLife: { ambient: number; coldStorage: number }; // days
}

export interface PackagingOption {
  type: string;
  material: string;
  capacity: number;
  unit: string;
  costPerUnit: number;
  reusable: boolean;
  suitableFor: string[];
  benefits: string[];
}

export interface LossAssessment {
  id: string;
  farmerId: number;
  cropName: string;
  harvestQuantity: number;
  currentQuantity: number;
  lossQuantity: number;
  lossPercentage: number;
  lossCauses: LossCause[];
  economicLoss: number;
  preventionRecommendations: string[];
  assessmentDate: Date;
}

export interface LossCause {
  cause: string;
  stage: 'harvesting' | 'handling' | 'transport' | 'storage' | 'processing';
  percentage: number;
  preventable: boolean;
}

// Storage facilities database
const STORAGE_FACILITIES: StorageFacility[] = [
  {
    id: 'SF001',
    name: 'Lagos Agro Storage Hub',
    type: 'warehouse',
    location: { latitude: 6.5244, longitude: 3.3792, address: 'Ikeja, Lagos' },
    capacity: 5000,
    availableCapacity: 2000,
    suitableCrops: ['grains', 'legumes', 'oilseeds'],
    temperatureRange: { min: 20, max: 30 },
    humidityRange: { min: 40, max: 60 },
    pricePerTonPerDay: 150,
    currency: 'NGN',
    amenities: ['Fumigation', 'Weighbridge', 'Loading dock', 'Security'],
    certifications: ['NAFDAC Approved', 'ISO 22000'],
    rating: 4.5,
    contactPhone: '+234 801 234 5678',
    operatingHours: '7:00 AM - 6:00 PM',
    minimumBookingDays: 7,
  },
  {
    id: 'SF002',
    name: 'Kano Cold Storage Center',
    type: 'cold_storage',
    location: { latitude: 12.0022, longitude: 8.5920, address: 'Kano Industrial Area' },
    capacity: 1000,
    availableCapacity: 400,
    suitableCrops: ['fruits', 'vegetables'],
    temperatureRange: { min: 2, max: 10 },
    humidityRange: { min: 85, max: 95 },
    pricePerTonPerDay: 500,
    currency: 'NGN',
    amenities: ['Temperature monitoring', 'Backup generator', 'Sorting area'],
    certifications: ['Cold Chain Certified'],
    rating: 4.2,
    contactPhone: '+234 802 345 6789',
    operatingHours: '24/7',
    minimumBookingDays: 3,
  },
  {
    id: 'SF003',
    name: 'Ibadan Grain Silos',
    type: 'metal_silo',
    location: { latitude: 7.3775, longitude: 3.9470, address: 'Ibadan, Oyo State' },
    capacity: 10000,
    availableCapacity: 6000,
    suitableCrops: ['grains'],
    temperatureRange: { min: 18, max: 28 },
    humidityRange: { min: 35, max: 55 },
    pricePerTonPerDay: 100,
    currency: 'NGN',
    amenities: ['Aeration system', 'Moisture monitoring', 'Pest control'],
    certifications: ['NAFDAC Approved'],
    rating: 4.7,
    contactPhone: '+234 803 456 7890',
    operatingHours: '6:00 AM - 8:00 PM',
    minimumBookingDays: 14,
  },
  {
    id: 'SF004',
    name: 'Community Hermetic Storage',
    type: 'hermetic_bags',
    location: { latitude: 9.0579, longitude: 7.4951, address: 'Abuja, FCT' },
    capacity: 500,
    availableCapacity: 300,
    suitableCrops: ['grains', 'legumes'],
    pricePerTonPerDay: 50,
    currency: 'NGN',
    amenities: ['Training provided', 'Bag replacement'],
    certifications: [],
    rating: 4.0,
    contactPhone: '+234 804 567 8901',
    operatingHours: '8:00 AM - 5:00 PM',
    minimumBookingDays: 30,
  },
  {
    id: 'SF005',
    name: 'Evaporative Cooler Hub',
    type: 'evaporative_cooler',
    location: { latitude: 6.8429, longitude: 7.3733, address: 'Enugu' },
    capacity: 200,
    availableCapacity: 150,
    suitableCrops: ['fruits', 'vegetables', 'tubers'],
    temperatureRange: { min: 15, max: 22 },
    humidityRange: { min: 80, max: 90 },
    pricePerTonPerDay: 200,
    currency: 'NGN',
    amenities: ['Solar powered', 'Sorting area'],
    certifications: [],
    rating: 3.8,
    contactPhone: '+234 805 678 9012',
    operatingHours: '7:00 AM - 7:00 PM',
    minimumBookingDays: 1,
  },
];

// Cold chain providers
const COLD_CHAIN_PROVIDERS: ColdChainProvider[] = [
  {
    id: 'CCP001',
    name: 'ColdLink Logistics',
    serviceArea: ['Lagos', 'Ogun', 'Oyo', 'Osun'],
    vehicleTypes: [
      { type: 'Refrigerated Van', capacity: 2, temperatureControlled: true, available: 5 },
      { type: 'Refrigerated Truck', capacity: 10, temperatureControlled: true, available: 3 },
    ],
    temperatureCapabilities: { min: -20, max: 15 },
    pricePerKmPerTon: 150,
    currency: 'NGN',
    rating: 4.5,
    certifications: ['Cold Chain Certified', 'NAFDAC Approved'],
    contactPhone: '+234 806 789 0123',
    trackingAvailable: true,
  },
  {
    id: 'CCP002',
    name: 'FreshMove Transport',
    serviceArea: ['Kano', 'Kaduna', 'Jigawa', 'Katsina'],
    vehicleTypes: [
      { type: 'Insulated Van', capacity: 3, temperatureControlled: false, available: 8 },
      { type: 'Refrigerated Truck', capacity: 8, temperatureControlled: true, available: 2 },
    ],
    temperatureCapabilities: { min: 0, max: 20 },
    pricePerKmPerTon: 120,
    currency: 'NGN',
    rating: 4.0,
    certifications: [],
    contactPhone: '+234 807 890 1234',
    trackingAvailable: true,
  },
];

// Packaging recommendations by crop
const PACKAGING_RECOMMENDATIONS: Record<string, PackagingRecommendation> = {
  maize: {
    cropName: 'Maize',
    recommendedPackaging: [
      {
        type: 'Hermetic Bag',
        material: 'Multi-layer plastic',
        capacity: 100,
        unit: 'kg',
        costPerUnit: 2500,
        reusable: true,
        suitableFor: ['Long-term storage', 'Pest protection'],
        benefits: ['Prevents pest infestation', 'Maintains quality for 12+ months'],
      },
      {
        type: 'Polypropylene Bag',
        material: 'Woven PP',
        capacity: 50,
        unit: 'kg',
        costPerUnit: 350,
        reusable: false,
        suitableFor: ['Short-term storage', 'Transport'],
        benefits: ['Affordable', 'Widely available'],
      },
    ],
    handlingInstructions: [
      'Dry to 13% moisture before storage',
      'Clean and sort before bagging',
      'Store in cool, dry place',
      'Stack maximum 10 bags high',
    ],
    stackingLimit: 10,
    shelfLife: { ambient: 180, coldStorage: 365 },
  },
  tomato: {
    cropName: 'Tomato',
    recommendedPackaging: [
      {
        type: 'Plastic Crate',
        material: 'HDPE',
        capacity: 25,
        unit: 'kg',
        costPerUnit: 3500,
        reusable: true,
        suitableFor: ['Transport', 'Market display'],
        benefits: ['Ventilated', 'Stackable', 'Reduces bruising'],
      },
      {
        type: 'Cardboard Box',
        material: 'Corrugated cardboard',
        capacity: 10,
        unit: 'kg',
        costPerUnit: 500,
        reusable: false,
        suitableFor: ['Export', 'Retail'],
        benefits: ['Lightweight', 'Printable for branding'],
      },
    ],
    handlingInstructions: [
      'Harvest at breaker stage for transport',
      'Handle gently to avoid bruising',
      'Pre-cool to 12-15°C before transport',
      'Maintain cold chain throughout',
    ],
    stackingLimit: 5,
    shelfLife: { ambient: 7, coldStorage: 21 },
  },
  cassava: {
    cropName: 'Cassava',
    recommendedPackaging: [
      {
        type: 'Waxed Coating',
        material: 'Food-grade wax',
        capacity: 1,
        unit: 'tuber',
        costPerUnit: 50,
        reusable: false,
        suitableFor: ['Extended fresh storage', 'Export'],
        benefits: ['Extends shelf life to 2-3 weeks', 'Maintains freshness'],
      },
      {
        type: 'Jute Bag',
        material: 'Natural jute',
        capacity: 50,
        unit: 'kg',
        costPerUnit: 800,
        reusable: true,
        suitableFor: ['Local transport', 'Short-term storage'],
        benefits: ['Breathable', 'Biodegradable'],
      },
    ],
    handlingInstructions: [
      'Harvest carefully to avoid damage',
      'Process within 48 hours if not waxed',
      'Store in cool, humid conditions',
      'Avoid direct sunlight',
    ],
    stackingLimit: 8,
    shelfLife: { ambient: 3, coldStorage: 14 },
  },
  rice: {
    cropName: 'Rice',
    recommendedPackaging: [
      {
        type: 'Hermetic Bag',
        material: 'Multi-layer plastic',
        capacity: 50,
        unit: 'kg',
        costPerUnit: 1500,
        reusable: true,
        suitableFor: ['Long-term storage', 'Seed storage'],
        benefits: ['Prevents weevil infestation', 'Maintains germination'],
      },
      {
        type: 'Laminated Bag',
        material: 'PP with PE lining',
        capacity: 25,
        unit: 'kg',
        costPerUnit: 250,
        reusable: false,
        suitableFor: ['Retail', 'Consumer packaging'],
        benefits: ['Moisture barrier', 'Professional appearance'],
      },
    ],
    handlingInstructions: [
      'Mill and dry to 14% moisture',
      'Cool before packaging',
      'Store away from walls and floor',
      'Regular inspection for pests',
    ],
    stackingLimit: 12,
    shelfLife: { ambient: 365, coldStorage: 730 },
  },
};

class PostHarvestService {
  private bookings: BoundedMap<string, StorageBooking> = new BoundedMap(2000, 86400_000);
  private logisticsBookings: BoundedMap<string, LogisticsBooking> = new BoundedMap(2000, 86400_000);
  private qualityAssessments: BoundedMap<string, QualityAssessment> = new BoundedMap(5000, 86400_000);

  /**
   * Find available storage facilities
   */
  async findStorageFacilities(params: {
    cropCategory: CropCategory;
    quantity: number;
    latitude: number;
    longitude: number;
    radiusKm: number;
    requiresColdStorage?: boolean;
  }): Promise<StorageFacility[]> {
    const { cropCategory, quantity, latitude, longitude, radiusKm, requiresColdStorage } = params;

    let facilities = STORAGE_FACILITIES.filter(f => 
      f.suitableCrops.includes(cropCategory) &&
      f.availableCapacity >= quantity
    );

    if (requiresColdStorage) {
      facilities = facilities.filter(f => 
        f.type === 'cold_storage' || f.type === 'evaporative_cooler'
      );
    }

    // Filter by distance (simplified - would use proper geo calculation)
    facilities = facilities.filter(f => {
      const distance = this.calculateDistance(
        latitude, longitude,
        f.location.latitude, f.location.longitude
      );
      return distance <= radiusKm;
    });

    // Sort by rating and price
    return facilities.sort((a, b) => {
      const scoreA = a.rating * 10 - a.pricePerTonPerDay / 100;
      const scoreB = b.rating * 10 - b.pricePerTonPerDay / 100;
      return scoreB - scoreA;
    });
  }

  /**
   * Book storage facility
   */
  async bookStorage(params: {
    farmerId: number;
    facilityId: string;
    cropName: string;
    quantity: number;
    startDate: Date;
    endDate: Date;
  }): Promise<StorageBooking> {
    const { farmerId, facilityId, cropName, quantity, startDate, endDate } = params;

    const facility = STORAGE_FACILITIES.find(f => f.id === facilityId);
    if (!facility) {
      throw new Error('Storage facility not found');
    }

    if (facility.availableCapacity < quantity) {
      throw new Error('Insufficient storage capacity');
    }

    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
    if (days < facility.minimumBookingDays) {
      throw new Error(`Minimum booking is ${facility.minimumBookingDays} days`);
    }

    const totalCost = quantity * facility.pricePerTonPerDay * days;

    const bookingId = `SB-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const booking: StorageBooking = {
      id: bookingId,
      farmerId,
      facilityId,
      facilityName: facility.name,
      cropName,
      quantity,
      startDate,
      endDate,
      totalCost,
      status: 'pending',
    };

    this.bookings.set(bookingId, booking);

    // Update facility capacity
    facility.availableCapacity -= quantity;

    // Emit event
    try {
      await kafkaProducer.send({
        topic: 'storage-events',
        messages: [{
          key: bookingId,
          value: JSON.stringify({
            event: 'storage_booked',
            booking,
            timestamp: new Date().toISOString(),
          }),
        }],
      });
    } catch (error) {
      logger.warn('[PostHarvest] Could not emit Kafka event:', error);
    }

    return booking;
  }

  /**
   * Perform quality assessment
   */
  async performQualityAssessment(params: {
    cropName: string;
    moistureContent: number;
    foreignMatter: number;
    damagedGrains: number;
    discoloration: number;
    pestInfestation: boolean;
    moldPresence: boolean;
    photos?: string[];
  }): Promise<QualityAssessment> {
    const {
      cropName, moistureContent, foreignMatter, damagedGrains,
      discoloration, pestInfestation, moldPresence, photos
    } = params;

    // Calculate overall score
    let score = 100;
    
    // Moisture penalties
    if (moistureContent > 14) score -= (moistureContent - 14) * 5;
    if (moistureContent < 10) score -= (10 - moistureContent) * 3;
    
    // Foreign matter penalties
    score -= foreignMatter * 10;
    
    // Damage penalties
    score -= damagedGrains * 5;
    score -= discoloration * 3;
    
    // Infestation penalties
    if (pestInfestation) score -= 20;
    if (moldPresence) score -= 25;

    score = Math.max(0, Math.min(100, score));

    // Determine grade
    let grade: QualityAssessment['grade'];
    if (score >= 90) grade = 'A';
    else if (score >= 75) grade = 'B';
    else if (score >= 60) grade = 'C';
    else if (score >= 40) grade = 'D';
    else grade = 'Reject';

    // Generate recommendations
    const recommendations: string[] = [];
    if (moistureContent > 14) {
      recommendations.push(`Dry to reduce moisture from ${moistureContent}% to below 14%`);
    }
    if (foreignMatter > 2) {
      recommendations.push('Clean and sort to remove foreign matter');
    }
    if (pestInfestation) {
      recommendations.push('Fumigate before storage');
    }
    if (moldPresence) {
      recommendations.push('Separate affected produce; do not store with healthy stock');
    }
    if (grade === 'A' || grade === 'B') {
      recommendations.push('Suitable for premium markets and export');
    }

    const assessmentId = `QA-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const assessment: QualityAssessment = {
      id: assessmentId,
      cropName,
      assessmentDate: new Date(),
      grade,
      moistureContent,
      foreignMatter,
      damagedGrains,
      discoloration,
      pestInfestation,
      moldPresence,
      overallScore: Math.round(score),
      recommendations,
      photos,
    };

    this.qualityAssessments.set(assessmentId, assessment);

    return assessment;
  }

  /**
   * Find cold chain providers
   */
  async findColdChainProviders(params: {
    pickupLocation: string;
    deliveryLocation: string;
    quantity: number;
    temperatureRequired?: number;
  }): Promise<ColdChainProvider[]> {
    const { pickupLocation, quantity, temperatureRequired } = params;

    let providers = COLD_CHAIN_PROVIDERS.filter(p =>
      p.serviceArea.some(area => 
        pickupLocation.toLowerCase().includes(area.toLowerCase())
      )
    );

    // Filter by temperature capability
    if (temperatureRequired !== undefined) {
      providers = providers.filter(p =>
        p.temperatureCapabilities.min <= temperatureRequired &&
        p.temperatureCapabilities.max >= temperatureRequired
      );
    }

    // Filter by capacity
    providers = providers.filter(p =>
      p.vehicleTypes.some(v => v.capacity >= quantity && v.available > 0)
    );

    return providers.sort((a, b) => b.rating - a.rating);
  }

  /**
   * Book cold chain logistics
   */
  async bookLogistics(params: {
    farmerId: number;
    providerId: string;
    cropName: string;
    quantity: number;
    pickupLocation: { latitude: number; longitude: number; address: string };
    deliveryLocation: { latitude: number; longitude: number; address: string };
    pickupDate: Date;
    temperatureRequired?: number;
  }): Promise<LogisticsBooking> {
    const {
      farmerId, providerId, cropName, quantity,
      pickupLocation, deliveryLocation, pickupDate, temperatureRequired
    } = params;

    const provider = COLD_CHAIN_PROVIDERS.find(p => p.id === providerId);
    if (!provider) {
      throw new Error('Provider not found');
    }

    // Calculate distance and cost
    const distance = this.calculateDistance(
      pickupLocation.latitude, pickupLocation.longitude,
      deliveryLocation.latitude, deliveryLocation.longitude
    );
    const totalCost = Math.round(distance * quantity * provider.pricePerKmPerTon);

    // Estimate delivery date (assume 50km/hour average)
    const travelHours = distance / 50;
    const estimatedDeliveryDate = new Date(pickupDate.getTime() + travelHours * 60 * 60 * 1000);

    const bookingId = `LB-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const booking: LogisticsBooking = {
      id: bookingId,
      farmerId,
      providerId,
      providerName: provider.name,
      cropName,
      quantity,
      pickupLocation,
      deliveryLocation,
      pickupDate,
      estimatedDeliveryDate,
      temperatureRequired,
      totalCost,
      status: 'pending',
      trackingId: provider.trackingAvailable ? `TRK-${Date.now()}` : undefined,
      temperatureLog: [],
    };

    this.logisticsBookings.set(bookingId, booking);

    return booking;
  }

  /**
   * Get packaging recommendations
   */
  getPackagingRecommendations(cropName: string): PackagingRecommendation | null {
    const key = cropName.toLowerCase();
    return PACKAGING_RECOMMENDATIONS[key] || null;
  }

  /**
   * Assess post-harvest losses
   */
  async assessLosses(params: {
    farmerId: number;
    cropName: string;
    harvestQuantity: number;
    currentQuantity: number;
    stages: Array<{ stage: LossCause['stage']; lossPercentage: number; cause: string }>;
    pricePerUnit: number;
  }): Promise<LossAssessment> {
    const { farmerId, cropName, harvestQuantity, currentQuantity, stages, pricePerUnit } = params;

    const lossQuantity = harvestQuantity - currentQuantity;
    const lossPercentage = (lossQuantity / harvestQuantity) * 100;
    const economicLoss = lossQuantity * pricePerUnit;

    const lossCauses: LossCause[] = stages.map(s => ({
      cause: s.cause,
      stage: s.stage,
      percentage: s.lossPercentage,
      preventable: s.lossPercentage > 2, // Losses above 2% are considered preventable
    }));

    // Generate prevention recommendations
    const preventionRecommendations: string[] = [];
    
    for (const cause of lossCauses) {
      if (cause.stage === 'harvesting' && cause.percentage > 2) {
        preventionRecommendations.push('Train workers on proper harvesting techniques');
        preventionRecommendations.push('Harvest at optimal maturity stage');
      }
      if (cause.stage === 'handling' && cause.percentage > 2) {
        preventionRecommendations.push('Use appropriate containers to reduce bruising');
        preventionRecommendations.push('Handle produce gently during sorting');
      }
      if (cause.stage === 'transport' && cause.percentage > 2) {
        preventionRecommendations.push('Use refrigerated transport for perishables');
        preventionRecommendations.push('Reduce transport time and distance');
      }
      if (cause.stage === 'storage' && cause.percentage > 2) {
        preventionRecommendations.push('Use hermetic storage for grains');
        preventionRecommendations.push('Monitor temperature and humidity regularly');
        preventionRecommendations.push('Implement pest management protocols');
      }
    }

    if (lossPercentage > 15) {
      preventionRecommendations.push('Consider investing in improved storage facilities');
      preventionRecommendations.push('Join a cooperative for shared cold storage access');
    }

    const assessmentId = `LA-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const assessment: LossAssessment = {
      id: assessmentId,
      farmerId,
      cropName,
      harvestQuantity,
      currentQuantity,
      lossQuantity,
      lossPercentage: Math.round(lossPercentage * 10) / 10,
      lossCauses,
      economicLoss: Math.round(economicLoss),
      preventionRecommendations,
      assessmentDate: new Date(),
    };

    return assessment;
  }

  /**
   * Get loss reduction tips by crop
   */
  getLossReductionTips(cropCategory: CropCategory): string[] {
    const tips: Record<CropCategory, string[]> = {
      grains: [
        'Dry grains to 13-14% moisture before storage',
        'Use hermetic bags or metal silos for long-term storage',
        'Fumigate storage facilities before use',
        'Regular inspection for pest infestation',
        'Store on pallets away from walls',
      ],
      tubers: [
        'Cure tubers before storage to heal wounds',
        'Store in cool, dark, well-ventilated areas',
        'Process into chips or flour for longer shelf life',
        'Apply wax coating for extended fresh storage',
        'Avoid bruising during harvest and handling',
      ],
      fruits: [
        'Harvest at correct maturity stage',
        'Pre-cool immediately after harvest',
        'Maintain cold chain throughout distribution',
        'Use ventilated packaging',
        'Sort and grade to remove damaged produce',
      ],
      vegetables: [
        'Harvest during cool hours of the day',
        'Remove field heat quickly',
        'Use evaporative coolers for short-term storage',
        'Maintain high humidity for leafy vegetables',
        'Process surplus into dried or preserved products',
      ],
      legumes: [
        'Dry to 12-13% moisture content',
        'Use hermetic storage to prevent weevils',
        'Add natural protectants like neem leaves',
        'Store in cool, dry conditions',
        'Regular monitoring for pest activity',
      ],
      oilseeds: [
        'Dry to safe moisture levels (8-10%)',
        'Store in airtight containers',
        'Protect from light to prevent rancidity',
        'Process into oil quickly if storage is limited',
        'Monitor for fungal growth',
      ],
    };

    return tips[cropCategory] || [];
  }

  /**
   * Get farmer's storage bookings
   */
  getFarmerBookings(farmerId: number): StorageBooking[] {
    return Array.from(this.bookings.values()).filter(b => b.farmerId === farmerId);
  }

  /**
   * Get farmer's logistics bookings
   */
  getFarmerLogisticsBookings(farmerId: number): LogisticsBooking[] {
    return Array.from(this.logisticsBookings.values()).filter(b => b.farmerId === farmerId);
  }

  /**
   * Get all storage facilities
   */
  getAllStorageFacilities(): StorageFacility[] {
    return STORAGE_FACILITIES;
  }

  /**
   * Get all cold chain providers
   */
  getAllColdChainProviders(): ColdChainProvider[] {
    return COLD_CHAIN_PROVIDERS;
  }

  // Private helper methods

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}

export const postHarvestService = new PostHarvestService();
