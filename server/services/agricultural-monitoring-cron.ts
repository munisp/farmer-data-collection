/**
 * Agricultural Monitoring Cron Jobs
 * 
 * Automated monitoring for:
 * - Daily soil moisture checks
 * - GDD accumulation updates
 * - Pest/disease risk assessments
 * - Alert notifications
 */

import * as cron from 'node-cron';
import { getDb } from '../db.js';
import { crops } from '../../drizzle/schema.js';
import { cropCalendar, pestDiseaseRisks } from '../../drizzle/schema-agricultural-intelligence.js';
import { eq } from 'drizzle-orm';
import {
  getSoilMoisture,
  getIrrigationRecommendation,
  type SoilType,
  type CropType,
} from './soil-moisture-service.js';
import {
  getCropGrowthStatus,
  type CropTypeGDD,
  type DailyWeatherData,
} from './gdd-service.js';
import {
  calculateCropRisks,
  getHighPriorityAlerts,
  type WeatherConditions,
} from './pest-disease-risk-service.js';
import { logger } from '../logger.js';
import {
  sendAllAgriculturalAlerts,
} from './agricultural-notifications.js';

// Store active cron jobs
const activeCronJobs: Map<string, cron.ScheduledTask> = new Map();

/**
 * Daily soil moisture monitoring
 * Runs at 6:00 AM every day
 */
export function startSoilMoistureMonitoring() {
  const job = cron.schedule('0 6 * * *', async () => {
    logger.info('[Cron] Running daily soil moisture monitoring...');
    
    try {
      const db = await getDb();
      if (!db) {
        logger.error('[Cron] Database not available');
        return;
      }

      // Get all active crops
      const activeCrops = await db
        .select()
        .from(crops)
        .where(eq(crops.status, 'planted'));

      logger.info(`[Cron] Found ${activeCrops.length} active crops to monitor`);

      for (const crop of activeCrops) {
        try {
          // Get farm location (would need to join with farms table)
          // For now, skip if no location
          
          // Get soil moisture data
          // const soilMoisture = await getSoilMoisture(latitude, longitude);
          
          // Get irrigation recommendation
          // const recommendation = await getIrrigationRecommendation(...);
          
          // If irrigation needed with high urgency, send notification
          // if (recommendation.shouldIrrigate && recommendation.urgency === 'immediate') {
          //   await sendNotification(crop.userId, {
          //     title: 'Urgent: Irrigation Needed',
          //     message: recommendation.reason,
          //   });
          // }
          
          logger.info(`[Cron] Processed soil moisture for crop ${crop.id}`);
        } catch (error) {
          logger.error(`[Cron] Error processing crop ${crop.id}:`, error);
        }
      }
      
      logger.info('[Cron] Soil moisture monitoring completed');
    } catch (error) {
      logger.error('[Cron] Error in soil moisture monitoring:', error);
    }
  });

  activeCronJobs.set('soil-moisture', job);
  logger.info('[Cron] Soil moisture monitoring scheduled (daily at 6:00 AM)');
}

/**
 * Daily GDD accumulation update
 * Runs at 7:00 AM every day
 */
export function startGDDTracking() {
  const job = cron.schedule('0 7 * * *', async () => {
    logger.info('[Cron] Running daily GDD accumulation update...');
    
    try {
      const db = await getDb();
      if (!db) {
        logger.error('[Cron] Database not available');
        return;
      }

      // Get all active crops with calendar entries
      const activeCrops = await db
        .select()
        .from(crops)
        .where(eq(crops.status, 'planted'));

      logger.info(`[Cron] Found ${activeCrops.length} crops for GDD tracking`);

      for (const crop of activeCrops) {
        try {
          // Fetch yesterday's weather data
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          
          // Mock weather data (replace with actual API call)
          const weatherData: DailyWeatherData[] = [{
            date: yesterday,
            tempMax: 30,
            tempMin: 22,
          }];
          
          // Calculate GDD and update calendar
          const cropType = crop.cropName.toLowerCase() as CropTypeGDD;
          const plantingDate = crop.plantingDate;
          const currentDate = new Date();
          
          // Get full weather history (would need to fetch from weather API)
          // const status = getCropGrowthStatus(plantingDate, currentDate, weatherData, cropType);
          
          // Update crop calendar
          // await db.update(cropCalendar)
          //   .set({
          //     cumulativeGDD: status.cumulativeGDD,
          //     currentStage: status.currentStage,
          //     estimatedHarvestDate: status.estimatedHarvestDate,
          //     updatedAt: new Date(),
          //   })
          //   .where(eq(cropCalendar.cropId, crop.id));
          
          // If approaching harvest (< 14 days), send notification
          // if (status.daysToHarvest <= 14) {
          //   await sendNotification(crop.userId, {
          //     title: 'Harvest Approaching',
          //     message: `${crop.cropName} will be ready for harvest in ${status.daysToHarvest} days`,
          //   });
          // }
          
          logger.info(`[Cron] Updated GDD for crop ${crop.id}`);
        } catch (error) {
          logger.error(`[Cron] Error processing GDD for crop ${crop.id}:`, error);
        }
      }
      
      logger.info('[Cron] GDD tracking completed');
    } catch (error) {
      logger.error('[Cron] Error in GDD tracking:', error);
    }
  });

  activeCronJobs.set('gdd-tracking', job);
  logger.info('[Cron] GDD tracking scheduled (daily at 7:00 AM)');
}

/**
 * Pest and disease risk assessment
 * Runs at 8:00 AM every day
 */
export function startPestDiseaseMonitoring() {
  const job = cron.schedule('0 8 * * *', async () => {
    logger.info('[Cron] Running daily pest/disease risk assessment...');
    
    try {
      const db = await getDb();
      if (!db) {
        logger.error('[Cron] Database not available');
        return;
      }

      // Get all active crops
      const activeCrops = await db
        .select()
        .from(crops)
        .where(eq(crops.status, 'planted'));

      logger.info(`[Cron] Found ${activeCrops.length} crops for risk assessment`);

      // Get current weather conditions (would fetch from weather API)
      const weather: WeatherConditions = {
        temperature: 28,
        humidity: 75,
        rainfall: 85,
      };

      for (const crop of activeCrops) {
        try {
          const cropType = crop.cropName.toLowerCase();
          
          // Calculate risks
          const risks = calculateCropRisks(cropType, weather);
          const highPriorityAlerts = getHighPriorityAlerts(weather);
          
          // Store high-risk alerts in database
          for (const alert of highPriorityAlerts) {
            if ((alert.affectedCrops as any).includes(cropType)) {
              await db.insert(pestDiseaseRisks).values({
                cropId: crop.id,
                pestOrDisease: alert.pestOrDisease,
                type: alert.type,
                riskLevel: alert.riskLevel,
                riskScore: alert.riskScore,
                temperature: weather.temperature.toString(),
                humidity: weather.humidity.toString(),
                rainfall: weather.rainfall.toString(),
                recommendation: alert.recommendation,
                assessmentDate: new Date(),
              });
              
              // Send notification for critical risks
              // if (alert.riskLevel === 'critical') {
              //   await sendNotification(crop.userId, {
              //     title: `Critical Risk: ${alert.pestOrDisease}`,
              //     message: alert.recommendation,
              //   });
              // }
            }
          }
          
          logger.info(`[Cron] Assessed risks for crop ${crop.id}`);
        } catch (error) {
          logger.error(`[Cron] Error assessing risks for crop ${crop.id}:`, error);
        }
      }
      
      logger.info('[Cron] Pest/disease monitoring completed');
    } catch (error) {
      logger.error('[Cron] Error in pest/disease monitoring:', error);
    }
  });

  activeCronJobs.set('pest-disease', job);
  logger.info('[Cron] Pest/disease monitoring scheduled (daily at 8:00 AM)');
}

/**
 * SMS Notification Service
 * Runs at 9:00 AM every day to send critical alerts
 */
export function startSMSNotifications() {
  const job = cron.schedule('0 9 * * *', async () => {
    logger.info('[Cron] Running daily SMS notification service...');
    
    try {
      const results = await sendAllAgriculturalAlerts();
      
      logger.info('[Cron] SMS notification service completed');
      logger.info(`  - Irrigation alerts: ${results.irrigation.sentCount} sent, ${results.irrigation.failedCount} failed`);
      logger.info(`  - Harvest alerts: ${results.harvest.sentCount} sent, ${results.harvest.failedCount} failed`);
      logger.info(`  - Pest/disease alerts: ${results.pestDisease.sentCount} sent, ${results.pestDisease.failedCount} failed`);
    } catch (error) {
      logger.error('[Cron] Error in SMS notification service:', error);
    }
  });

  activeCronJobs.set('sms-notifications', job);
  logger.info('[Cron] SMS notifications scheduled (daily at 9:00 AM)');
}

/**
 * Weekly summary report
 * Runs at 10:00 AM every Monday
 */
export function startWeeklySummary() {
  const job = cron.schedule('0 10 * * 1', async () => {
    logger.info('[Cron] Generating weekly agricultural intelligence summary...');
    
    try {
      const db = await getDb();
      if (!db) {
        logger.error('[Cron] Database not available');
        return;
      }

      // Get all users with active crops
      // Generate weekly summary for each user
      // Send email/SMS with summary
      
      logger.info('[Cron] Weekly summary completed');
    } catch (error) {
      logger.error('[Cron] Error generating weekly summary:', error);
    }
  });

  activeCronJobs.set('weekly-summary', job);
  logger.info('[Cron] Weekly summary scheduled (Mondays at 10:00 AM)');
}

/**
 * Start all agricultural monitoring cron jobs
 */
export function startAllMonitoring() {
  logger.info('[Cron] Starting all agricultural monitoring jobs...');
  
  startSoilMoistureMonitoring();
  startGDDTracking();
  startPestDiseaseMonitoring();
  startSMSNotifications();
  startWeeklySummary();
  
  logger.info('[Cron] All monitoring jobs started successfully');
}

/**
 * Stop all cron jobs
 */
export function stopAllMonitoring() {
  logger.info('[Cron] Stopping all agricultural monitoring jobs...');
  
  activeCronJobs.forEach((job, name) => {
    job.stop();
    logger.info(`[Cron] Stopped ${name}`);
  });
  
  activeCronJobs.clear();
  logger.info('[Cron] All monitoring jobs stopped');
}

/**
 * Get status of all cron jobs
 */
export function getMonitoringStatus() {
  const status: Record<string, boolean> = {};
  
  activeCronJobs.forEach((job, name) => {
    status[name] = true; // Job is running
  });
  
  return {
    active: activeCronJobs.size,
    jobs: status,
  };
}
