/**
 * API Versioning Middleware
 * Supports multiple API versions for backward compatibility
 */

import { Request, Response, NextFunction, Router } from 'express';

type ApiVersion = 'v1' | 'v2' | 'v3';

interface VersionConfig {
  default: ApiVersion;
  supported: ApiVersion[];
  deprecated: ApiVersion[];
  sunset: Record<ApiVersion, string>; // Sunset dates for deprecated versions
}

const defaultConfig: VersionConfig = {
  default: 'v2',
  supported: ['v1', 'v2'],
  deprecated: ['v1'],
  sunset: {
    v1: '2025-06-01',
    v2: '',
    v3: '',
  },
};

// Version extraction strategies
type VersionStrategy = 'header' | 'path' | 'query' | 'accept';

function extractVersionFromHeader(req: Request): ApiVersion | null {
  const version = req.headers['x-api-version'] as string;
  return version as ApiVersion || null;
}

function extractVersionFromPath(req: Request): ApiVersion | null {
  const match = req.path.match(/^\/api\/(v\d+)\//);
  return match ? match[1] as ApiVersion : null;
}

function extractVersionFromQuery(req: Request): ApiVersion | null {
  const version = req.query.version as string;
  return version as ApiVersion || null;
}

function extractVersionFromAccept(req: Request): ApiVersion | null {
  const accept = req.headers.accept || '';
  const match = accept.match(/application\/vnd\.agrifinance\.(v\d+)\+json/);
  return match ? match[1] as ApiVersion : null;
}

// Version extraction with fallback chain
function extractVersion(
  req: Request,
  strategies: VersionStrategy[] = ['header', 'path', 'query', 'accept']
): ApiVersion | null {
  for (const strategy of strategies) {
    let version: ApiVersion | null = null;
    
    switch (strategy) {
      case 'header':
        version = extractVersionFromHeader(req);
        break;
      case 'path':
        version = extractVersionFromPath(req);
        break;
      case 'query':
        version = extractVersionFromQuery(req);
        break;
      case 'accept':
        version = extractVersionFromAccept(req);
        break;
    }

    if (version) return version;
  }

  return null;
}

// Main versioning middleware
export function apiVersioning(config: Partial<VersionConfig> = {}) {
  const mergedConfig = { ...defaultConfig, ...config };

  return (req: Request, res: Response, next: NextFunction) => {
    // Extract version from request
    const requestedVersion = extractVersion(req) || mergedConfig.default;

    // Check if version is supported
    if (!mergedConfig.supported.includes(requestedVersion)) {
      return res.status(400).json({
        error: 'Unsupported API Version',
        message: `API version '${requestedVersion}' is not supported. Supported versions: ${mergedConfig.supported.join(', ')}`,
        supportedVersions: mergedConfig.supported,
      });
    }

    // Attach version to request
    (req as any).apiVersion = requestedVersion;

    // Set version in response header
    res.setHeader('X-API-Version', requestedVersion);

    // Add deprecation warning if applicable
    if (mergedConfig.deprecated.includes(requestedVersion)) {
      const sunsetDate = mergedConfig.sunset[requestedVersion];
      res.setHeader('Deprecation', 'true');
      if (sunsetDate) {
        res.setHeader('Sunset', new Date(sunsetDate).toUTCString());
      }
      res.setHeader(
        'X-Deprecation-Notice',
        `API version ${requestedVersion} is deprecated. Please migrate to ${mergedConfig.default}.`
      );
    }

    next();
  };
}

// Version-specific route handler
export function versionedRoute(handlers: Partial<Record<ApiVersion, (req: Request, res: Response, next: NextFunction) => void>>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const version = (req as any).apiVersion as ApiVersion;
    const handler = handlers[version];

    if (handler) {
      return handler(req, res, next);
    }

    // Fall back to latest available version
    const versions: ApiVersion[] = ['v3', 'v2', 'v1'];
    for (const v of versions) {
      if (handlers[v]) {
        return handlers[v]!(req, res, next);
      }
    }

    next();
  };
}

// Response transformer for version compatibility
export function transformResponse(version: ApiVersion, data: Record<string, unknown>, resourceType: string): Record<string, unknown> {
  switch (resourceType) {
    case 'farmer':
      return transformFarmerResponse(version, data);
    case 'loan':
      return transformLoanResponse(version, data);
    case 'harvest':
      return transformHarvestResponse(version, data);
    default:
      return data;
  }
}

// Farmer response transformations
function transformFarmerResponse(version: ApiVersion, data: Record<string, unknown>): Record<string, unknown> {
  if (version === 'v1') {
    // V1: Flat structure, snake_case
    return {
      id: data.id,
      first_name: data.firstName,
      last_name: data.lastName,
      full_name: `${data.firstName} ${data.lastName}`,
      phone_number: data.phone,
      email_address: data.email,
      national_id: data.nationalId,
      region: data.region,
      district: data.district,
      village: data.village,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
    };
  }

  // V2+: Nested structure, camelCase
  return {
    id: data.id,
    personalInfo: {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      email: data.email,
      nationalId: data.nationalId,
    },
    location: {
      region: data.region,
      district: data.district,
      village: data.village,
      coordinates: data.coordinates,
    },
    metadata: {
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      status: data.status,
    },
  };
}

// Loan response transformations
function transformLoanResponse(version: ApiVersion, data: Record<string, unknown>): Record<string, unknown> {
  if (version === 'v1') {
    return {
      id: data.id,
      farmer_id: data.farmerId,
      amount: data.amount,
      interest_rate: data.interestRate,
      term_months: data.termMonths,
      monthly_payment: data.monthlyPayment,
      status: data.status,
      purpose: data.purpose,
      created_at: data.createdAt,
      approved_at: data.approvedAt,
      disbursed_at: data.disbursedAt,
    };
  }

  return {
    id: data.id,
    farmerId: data.farmerId,
    terms: {
      amount: data.amount,
      interestRate: data.interestRate,
      termMonths: data.termMonths,
      monthlyPayment: data.monthlyPayment,
    },
    status: data.status,
    purpose: data.purpose,
    timeline: {
      createdAt: data.createdAt,
      approvedAt: data.approvedAt,
      disbursedAt: data.disbursedAt,
      completedAt: data.completedAt,
    },
    repayment: {
      totalPaid: data.totalPaid,
      remainingBalance: data.remainingBalance,
      nextDueDate: data.nextDueDate,
    },
  };
}

// Harvest response transformations
function transformHarvestResponse(version: ApiVersion, data: Record<string, unknown>): Record<string, unknown> {
  if (version === 'v1') {
    return {
      id: data.id,
      farm_id: data.farmId,
      crop_type: data.cropType,
      quantity: data.quantity,
      unit: data.unit,
      harvest_date: data.harvestDate,
      quality_grade: data.qualityGrade,
      created_at: data.createdAt,
    };
  }

  return {
    id: data.id,
    farmId: data.farmId,
    crop: {
      type: data.cropType,
      variety: data.variety,
    },
    yield: {
      quantity: data.quantity,
      unit: data.unit,
      qualityGrade: data.qualityGrade,
    },
    harvestDate: data.harvestDate,
    metadata: {
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    },
  };
}

// Request transformer for version compatibility
export function transformRequest(version: ApiVersion, data: Record<string, unknown>, resourceType: string): Record<string, unknown> {
  switch (resourceType) {
    case 'farmer':
      return transformFarmerRequest(version, data);
    case 'loan':
      return transformLoanRequest(version, data);
    default:
      return data;
  }
}

function transformFarmerRequest(version: ApiVersion, data: Record<string, unknown>): Record<string, unknown> {
  if (version === 'v1') {
    // V1 uses snake_case, transform to internal format
    return {
      firstName: data.first_name,
      lastName: data.last_name,
      phone: data.phone_number,
      email: data.email_address,
      nationalId: data.national_id,
      region: data.region,
      district: data.district,
      village: data.village,
    };
  }

  // V2+ uses nested structure
  const personalInfo = data.personalInfo as Record<string, unknown> | undefined;
  const location = data.location as Record<string, unknown> | undefined;
  return {
    firstName: personalInfo?.firstName,
    lastName: personalInfo?.lastName,
    phone: personalInfo?.phone,
    email: personalInfo?.email,
    nationalId: personalInfo?.nationalId,
    region: location?.region,
    district: location?.district,
    village: location?.village,
    coordinates: location?.coordinates,
  };
}

function transformLoanRequest(version: ApiVersion, data: Record<string, unknown>): Record<string, unknown> {
  if (version === 'v1') {
    return {
      farmerId: data.farmer_id,
      amount: data.amount,
      interestRate: data.interest_rate,
      termMonths: data.term_months,
      purpose: data.purpose,
    };
  }

  const terms = data.terms as Record<string, unknown> | undefined;
  return {
    farmerId: data.farmerId,
    amount: terms?.amount,
    interestRate: terms?.interestRate,
    termMonths: terms?.termMonths,
    purpose: data.purpose,
  };
}

// Versioned router factory
export function createVersionedRouter(): {
  v1: Router;
  v2: Router;
  combined: Router;
} {
  const v1Router = Router();
  const v2Router = Router();
  const combinedRouter = Router();

  // Mount version-specific routers
  combinedRouter.use('/v1', v1Router);
  combinedRouter.use('/v2', v2Router);

  // Default to v2 for unversioned requests
  combinedRouter.use('/', (req, res, next) => {
    if (!req.path.startsWith('/v1') && !req.path.startsWith('/v2')) {
      (req as any).apiVersion = 'v2';
    }
    next();
  });

  return { v1: v1Router, v2: v2Router, combined: combinedRouter };
}

// Version info endpoint
export function versionInfoHandler(config: Partial<VersionConfig> = {}) {
  const mergedConfig = { ...defaultConfig, ...config };

  return (req: Request, res: Response) => {
    res.json({
      currentVersion: mergedConfig.default,
      supportedVersions: mergedConfig.supported,
      deprecatedVersions: mergedConfig.deprecated,
      sunsetDates: mergedConfig.sunset,
      requestedVersion: (req as any).apiVersion,
    });
  };
}

export default {
  apiVersioning,
  versionedRoute,
  transformResponse,
  transformRequest,
  createVersionedRouter,
  versionInfoHandler,
};
