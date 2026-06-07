import { TRPCError } from "@trpc/server";
import { middleware } from "../_core/trpc-init.js";
import { logger } from "../logger.js";

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  tenantTier: "free" | "pro" | "enterprise";
  tenantFeatures: string[];
}

const TIER_FEATURES: Record<string, string[]> = {
  free: [
    "core_farming", "basic_marketplace", "weather_alerts", "sms_notifications",
    "basic_analytics", "farmer_registration", "crop_tracking",
  ],
  pro: [
    "core_farming", "basic_marketplace", "weather_alerts", "sms_notifications",
    "basic_analytics", "farmer_registration", "crop_tracking",
    "advanced_analytics", "ai_advisory", "iot_integration", "delivery_management",
    "microfinance", "credit_scoring", "aquaculture", "traceability",
    "satellite_imagery", "drone_mapping", "cold_chain", "equipment_fleet",
  ],
  enterprise: [
    "core_farming", "basic_marketplace", "weather_alerts", "sms_notifications",
    "basic_analytics", "farmer_registration", "crop_tracking",
    "advanced_analytics", "ai_advisory", "iot_integration", "delivery_management",
    "microfinance", "credit_scoring", "aquaculture", "traceability",
    "satellite_imagery", "drone_mapping", "cold_chain", "equipment_fleet",
    "blockchain_provenance", "carbon_credits", "loan_decisioning", "stress_testing",
    "regulatory_reporting", "compliance_automation", "white_label", "api_access",
    "multi_currency", "contract_farming", "warehouse_receipts", "parametric_insurance",
    "tokenized_assets", "p2p_lending", "cooperative_governance",
  ],
};

const DEFAULT_TENANT: TenantContext = {
  tenantId: "tenant_default",
  tenantSlug: "default",
  tenantTier: "enterprise",
  tenantFeatures: TIER_FEATURES.enterprise,
};

export function resolveTenant(headers: Record<string, string | string[] | undefined>): TenantContext {
  const tenantHeader = headers["x-tenant-id"] as string | undefined;
  const hostHeader = headers["host"] as string | undefined;

  if (tenantHeader) {
    return {
      tenantId: tenantHeader,
      tenantSlug: tenantHeader.replace("tenant_", ""),
      tenantTier: (headers["x-tenant-tier"] as string as TenantContext["tenantTier"]) || "pro",
      tenantFeatures: TIER_FEATURES[(headers["x-tenant-tier"] as string) || "pro"] || TIER_FEATURES.pro,
    };
  }

  if (hostHeader && hostHeader.includes(".")) {
    const subdomain = hostHeader.split(".")[0];
    if (subdomain !== "www" && subdomain !== "api") {
      return {
        tenantId: `tenant_${subdomain}`,
        tenantSlug: subdomain,
        tenantTier: "pro",
        tenantFeatures: TIER_FEATURES.pro,
      };
    }
  }

  return DEFAULT_TENANT;
}

export const tenantMiddleware = middleware(async ({ ctx, next }) => {
  const headers = (ctx as any).req?.headers || {};
  const tenant = resolveTenant(headers);

  logger.info("[Tenant] Resolved tenant", { tenantId: tenant.tenantId, tier: tenant.tenantTier });

  return next({
    ctx: { ...ctx, tenant },
  });
});

export function requireFeature(feature: string) {
  return middleware(async ({ ctx, next }) => {
    const tenant = (ctx as any).tenant as TenantContext | undefined;
    if (!tenant) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Tenant context not available" });
    }
    if (!tenant.tenantFeatures.includes(feature)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Feature '${feature}' is not available on your ${tenant.tenantTier} plan. Upgrade to access this feature.`,
      });
    }
    return next();
  });
}

export function getTenantFeatures(tier: string): string[] {
  return TIER_FEATURES[tier] || TIER_FEATURES.free;
}

export function isTenantFeatureEnabled(tenant: TenantContext, feature: string): boolean {
  return tenant.tenantFeatures.includes(feature);
}
