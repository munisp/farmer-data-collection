import { getDb } from '../db';
import { farmers, farms, crops } from '../../drizzle/schema';
import { eq, and, lte, gte, sql } from 'drizzle-orm';
import { sendSMS } from './africas-talking';
import { logger } from '../logger.js';

/**
 * Agricultural Intelligence SMS Notification Service
 * 
 * Sends critical alerts to farmers via SMS:
 * - Irrigation alerts (low soil moisture)
 * - Harvest approaching notifications
 * - Pest/disease risk warnings
 */

export interface NotificationResult {
  success: boolean;
  sentCount: number;
  failedCount: number;
  errors: string[];
}

/**
 * Send irrigation alert when soil moisture is critically low
 * Threshold: < 30% volumetric water content
 */
export async function sendIrrigationAlerts(): Promise<NotificationResult> {
  const db = await getDb();
  if (!db) {
    return { success: false, sentCount: 0, failedCount: 0, errors: ['Database connection failed'] };
  }

  const result: NotificationResult = {
    success: true,
    sentCount: 0,
    failedCount: 0,
    errors: []
  };

  try {
    // Query farms with active crops and get latest soil moisture readings
    const farmsWithLowMoisture = await db
      .select({
        farmId: farms.id,
        farmName: farms.farmName,
        farmerId: farms.farmerId,
        latitude: farms.latitude,
        longitude: farms.longitude,
        farmerPhone: farmers.phoneNumber,
        farmerName: sql<string>`${farmers.firstName} || ' ' || ${farmers.lastName}`,
      })
      .from(farms)
      .innerJoin(farmers, eq(farms.farmerId, farmers.id))
      .where(
        and(
          sql`EXISTS (
            SELECT 1 FROM soil_moisture_readings smr
            WHERE smr.farm_id = ${farms.id}
            AND smr.moisture_level < 30
            AND smr.recorded_at > NOW() - INTERVAL '24 hours'
            ORDER BY smr.recorded_at DESC
            LIMIT 1
          )`
        )
      );

    logger.info(`[Agricultural Notifications] Found ${farmsWithLowMoisture.length} farms with low soil moisture`);

    for (const farm of farmsWithLowMoisture) {
      if (!farm.farmerPhone) {
        logger.info(`[Agricultural Notifications] Skipping farm ${farm.farmName} - no phone number`);
        continue;
      }

      const message = `🚨 IRRIGATION ALERT\n\nDear ${farm.farmerName},\n\nSoil moisture at ${farm.farmName} is critically low (<30%). Immediate irrigation recommended to prevent crop stress.\n\nCheck dashboard for details: https://your-app-url.com/agricultural-intelligence\n\n- Farmer Data Collection System`;

      try {
        await sendSMS({
          to: [farm.farmerPhone],
          message: message
        });
        result.sentCount++;
        logger.info(`[Agricultural Notifications] Irrigation alert sent to ${farm.farmerPhone}`);
      } catch (error) {
        result.failedCount++;
        const errorMsg = `Failed to send to ${farm.farmerPhone}: ${error}`;
        result.errors.push(errorMsg);
        logger.error(`[Agricultural Notifications] ${errorMsg}`);
      }
    }

    result.success = result.failedCount === 0;
    return result;
  } catch (error) {
    logger.error('[Agricultural Notifications] Error sending irrigation alerts:', error);
    return {
      success: false,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      errors: [...result.errors, `Database error: ${error}`]
    };
  }
}

/**
 * Send harvest approaching notifications
 * Sends alert 14 days before expected harvest date
 */
export async function sendHarvestApproachingAlerts(): Promise<NotificationResult> {
  const db = await getDb();
  if (!db) {
    return { success: false, sentCount: 0, failedCount: 0, errors: ['Database connection failed'] };
  }

  const result: NotificationResult = {
    success: true,
    sentCount: 0,
    failedCount: 0,
    errors: []
  };

  try {
    // Query crops with harvest date within 14-15 days
    const cropsNearingHarvest = await db
      .select({
        cropId: crops.id,
        cropName: crops.cropName,
        cropVariety: crops.cropVariety,
        expectedHarvestDate: crops.expectedHarvestDate,
        farmName: farms.farmName,
        farmerPhone: farmers.phoneNumber,
        farmerName: sql<string>`${farmers.firstName} || ' ' || ${farmers.lastName}`,
      })
      .from(crops)
      .innerJoin(farms, eq(crops.farmId, farms.id))
      .innerJoin(farmers, eq(farms.farmerId, farmers.id))
      .where(
        and(
          sql`${crops.expectedHarvestDate} >= CURRENT_DATE + INTERVAL '14 days'`,
          sql`${crops.expectedHarvestDate} <= CURRENT_DATE + INTERVAL '15 days'`,
          sql`${crops.status} IN ('growing', 'flowering', 'ripening')`
        )
      );

    logger.info(`[Agricultural Notifications] Found ${cropsNearingHarvest.length} crops nearing harvest`);

    for (const crop of cropsNearingHarvest) {
      if (!crop.farmerPhone) {
        logger.info(`[Agricultural Notifications] Skipping crop ${crop.cropName} - no phone number`);
        continue;
      }

      const harvestDate = crop.expectedHarvestDate ? new Date(crop.expectedHarvestDate).toLocaleDateString() : 'soon';
      const message = `🌾 HARVEST REMINDER\n\nDear ${crop.farmerName},\n\nYour ${crop.cropName} (${crop.cropVariety || 'variety'}) at ${crop.farmName} is approaching harvest!\n\nExpected date: ${harvestDate} (in ~14 days)\n\nPrepare harvesting equipment and labor. Check crop calendar for GDD status.\n\n- Farmer Data Collection System`;

      try {
        await sendSMS({
          to: [crop.farmerPhone],
          message: message
        });
        result.sentCount++;
        logger.info(`[Agricultural Notifications] Harvest alert sent to ${crop.farmerPhone}`);
      } catch (error) {
        result.failedCount++;
        const errorMsg = `Failed to send to ${crop.farmerPhone}: ${error}`;
        result.errors.push(errorMsg);
        logger.error(`[Agricultural Notifications] ${errorMsg}`);
      }
    }

    result.success = result.failedCount === 0;
    return result;
  } catch (error) {
    logger.error('[Agricultural Notifications] Error sending harvest alerts:', error);
    return {
      success: false,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      errors: [...result.errors, `Database error: ${error}`]
    };
  }
}

/**
 * Send pest/disease risk alerts
 * Sends alert when risk level is 80 or higher
 */
export async function sendPestDiseaseAlerts(): Promise<NotificationResult> {
  const db = await getDb();
  if (!db) {
    return { success: false, sentCount: 0, failedCount: 0, errors: ['Database connection failed'] };
  }

  const result: NotificationResult = {
    success: true,
    sentCount: 0,
    failedCount: 0,
    errors: []
  };

  try {
    // Query farms with high pest/disease risk in the last 24 hours
    const farmsWithHighRisk = await db
      .select({
        farmId: farms.id,
        farmName: farms.farmName,
        farmerPhone: farmers.phoneNumber,
        farmerName: sql<string>`${farmers.firstName} || ' ' || ${farmers.lastName}`,
        riskLevel: sql<number>`(
          SELECT risk_level
          FROM pest_disease_risks pdr
          WHERE pdr.farm_id = ${farms.id}
          AND pdr.assessed_at > NOW() - INTERVAL '24 hours'
          ORDER BY pdr.assessed_at DESC
          LIMIT 1
        )`,
        pestType: sql<string>`(
          SELECT pest_type
          FROM pest_disease_risks pdr
          WHERE pdr.farm_id = ${farms.id}
          AND pdr.assessed_at > NOW() - INTERVAL '24 hours'
          ORDER BY pdr.assessed_at DESC
          LIMIT 1
        )`,
        recommendations: sql<string>`(
          SELECT recommendations
          FROM pest_disease_risks pdr
          WHERE pdr.farm_id = ${farms.id}
          AND pdr.assessed_at > NOW() - INTERVAL '24 hours'
          ORDER BY pdr.assessed_at DESC
          LIMIT 1
        )`,
      })
      .from(farms)
      .innerJoin(farmers, eq(farms.farmerId, farmers.id))
      .where(
        sql`EXISTS (
          SELECT 1 FROM pest_disease_risks pdr
          WHERE pdr.farm_id = ${farms.id}
          AND pdr.risk_level >= 80
          AND pdr.assessed_at > NOW() - INTERVAL '24 hours'
        )`
      );

    logger.info(`[Agricultural Notifications] Found ${farmsWithHighRisk.length} farms with high pest/disease risk`);

    for (const farm of farmsWithHighRisk) {
      if (!farm.farmerPhone) {
        logger.info(`[Agricultural Notifications] Skipping farm ${farm.farmName} - no phone number`);
        continue;
      }

      const riskLevelText = farm.riskLevel >= 90 ? 'CRITICAL' : 'HIGH';
      const message = `⚠️ PEST/DISEASE ALERT\n\nDear ${farm.farmerName},\n\n${riskLevelText} risk detected at ${farm.farmName}!\n\nThreat: ${farm.pestType || 'Multiple pests/diseases'}\nRisk Level: ${farm.riskLevel}%\n\nAction: ${farm.recommendations?.substring(0, 100) || 'Check dashboard for IPM recommendations'}\n\nImmediate attention required!\n\n- Farmer Data Collection System`;

      try {
        await sendSMS({
          to: [farm.farmerPhone],
          message: message
        });
        result.sentCount++;
        logger.info(`[Agricultural Notifications] Pest/disease alert sent to ${farm.farmerPhone}`);
      } catch (error) {
        result.failedCount++;
        const errorMsg = `Failed to send to ${farm.farmerPhone}: ${error}`;
        result.errors.push(errorMsg);
        logger.error(`[Agricultural Notifications] ${errorMsg}`);
      }
    }

    result.success = result.failedCount === 0;
    return result;
  } catch (error) {
    logger.error('[Agricultural Notifications] Error sending pest/disease alerts:', error);
    return {
      success: false,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      errors: [...result.errors, `Database error: ${error}`]
    };
  }
}

/**
 * Send all agricultural alerts
 * Called by cron job daily
 */
export async function sendAllAgriculturalAlerts(): Promise<{
  irrigation: NotificationResult;
  harvest: NotificationResult;
  pestDisease: NotificationResult;
}> {
  logger.info('[Agricultural Notifications] Starting daily alert cycle...');

  const results = {
    irrigation: await sendIrrigationAlerts(),
    harvest: await sendHarvestApproachingAlerts(),
    pestDisease: await sendPestDiseaseAlerts(),
  };

  const totalSent = results.irrigation.sentCount + results.harvest.sentCount + results.pestDisease.sentCount;
  const totalFailed = results.irrigation.failedCount + results.harvest.failedCount + results.pestDisease.failedCount;

  logger.info(`[Agricultural Notifications] Daily alert cycle completed:`);
  logger.info(`  - Irrigation alerts: ${results.irrigation.sentCount} sent, ${results.irrigation.failedCount} failed`);
  logger.info(`  - Harvest alerts: ${results.harvest.sentCount} sent, ${results.harvest.failedCount} failed`);
  logger.info(`  - Pest/disease alerts: ${results.pestDisease.sentCount} sent, ${results.pestDisease.failedCount} failed`);
  logger.info(`  - Total: ${totalSent} sent, ${totalFailed} failed`);

  return results;
}
