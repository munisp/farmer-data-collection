/**
 * Sedona Job Orchestrator
 * 
 * Production-ready job orchestration for GPS spatial analytics:
 * - Scheduled job execution (cron-like)
 * - Job status tracking and monitoring
 * - Retry logic with exponential backoff
 * - Health checks for Spark/Sedona cluster
 * - Manual job triggering via API
 */

import { BoundedMap } from '../cache/bounded-map.js';
import { spawn } from 'child_process';
import * as path from 'path';
import { logger } from '../logger.js';

// Job configuration
interface JobConfig {
  name: string;
  description: string;
  script: string;
  args: string[];
  schedule: string; // cron expression
  timeout: number; // milliseconds
  retries: number;
  enabled: boolean;
}

interface JobRun {
  id: string;
  jobName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  output?: string;
  error?: string;
  retryCount: number;
}

interface JobSchedule {
  jobName: string;
  nextRun: Date;
  lastRun?: Date;
  lastStatus?: 'completed' | 'failed' | 'timeout';
}

// GPS Analytics Jobs Configuration
const GPS_JOBS: JobConfig[] = [
  {
    name: 'gps_farm_activity',
    description: 'Compute GPS farm activity aggregations using Sedona ST_Contains',
    script: 'sedona_jobs.py',
    args: ['--job', 'farm_activity'],
    schedule: '0 */6 * * *', // Every 6 hours
    timeout: 30 * 60 * 1000, // 30 minutes
    retries: 3,
    enabled: true,
  },
  {
    name: 'gps_device_coverage',
    description: 'Compute GPS device coverage analysis using Sedona ST_ConvexHull',
    script: 'sedona_jobs.py',
    args: ['--job', 'device_coverage'],
    schedule: '0 */12 * * *', // Every 12 hours
    timeout: 45 * 60 * 1000, // 45 minutes
    retries: 3,
    enabled: true,
  },
  {
    name: 'gps_heatmap',
    description: 'Generate GPS heatmap data with grid binning',
    script: 'sedona_jobs.py',
    args: ['--job', 'heatmap'],
    schedule: '0 0 * * *', // Daily at midnight
    timeout: 60 * 60 * 1000, // 60 minutes
    retries: 3,
    enabled: true,
  },
];

class SedonaJobOrchestrator {
  private jobs: BoundedMap<string, JobConfig> = new BoundedMap(500, 86400_000);
  private schedules: BoundedMap<string, JobSchedule> = new BoundedMap(500, 86400_000);
  private runHistory: JobRun[] = [];
  private activeRuns: Map<string, JobRun> = new Map();
  private schedulerInterval: NodeJS.Timeout | null = null;
  private sparkAvailable: boolean | null = null;
  private sedonaAvailable: boolean | null = null;

  constructor() {
    // Initialize jobs
    for (const job of GPS_JOBS) {
      this.jobs.set(job.name, job);
      this.schedules.set(job.name, {
        jobName: job.name,
        nextRun: this.calculateNextRun(job.schedule),
      });
    }
  }

  /**
   * Start the job scheduler
   */
  start(): void {
    if (this.schedulerInterval) {
      logger.info('[Sedona Orchestrator] Scheduler already running');
      return;
    }

    logger.info('[Sedona Orchestrator] Starting job scheduler');
    
    // Check Spark/Sedona availability on startup
    this.checkSparkAvailability();
    
    // Run scheduler every minute
    this.schedulerInterval = setInterval(() => {
      this.checkAndRunScheduledJobs();
    }, 60 * 1000);

    // Initial check
    this.checkAndRunScheduledJobs();
  }

  /**
   * Stop the job scheduler
   */
  stop(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
      logger.info('[Sedona Orchestrator] Scheduler stopped');
    }
  }

  /**
   * Check Spark/Sedona cluster availability
   */
  async checkSparkAvailability(): Promise<{ spark: boolean; sedona: boolean; message: string }> {
    try {
      // Try to run a simple Spark command to check availability
      const result = await this.runCommand('spark-submit', ['--version'], 5000);
      this.sparkAvailable = result.success;

      if (this.sparkAvailable) {
        // Check if Sedona is available by trying to import it
        const sedonaCheck = await this.runCommand('python3', [
          '-c',
          'from sedona.spark import SedonaContext; print("Sedona available")'
        ], 10000);
        this.sedonaAvailable = sedonaCheck.success;
      } else {
        this.sedonaAvailable = false;
      }

      const message = this.sparkAvailable
        ? (this.sedonaAvailable ? 'Spark and Sedona available' : 'Spark available, Sedona not found')
        : 'Spark not available';

      logger.info(`[Sedona Orchestrator] ${message}`);
      
      return {
        spark: this.sparkAvailable,
        sedona: this.sedonaAvailable || false,
        message,
      };
    } catch (error) {
      this.sparkAvailable = false;
      this.sedonaAvailable = false;
      const message = `Spark check failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logger.warn(`[Sedona Orchestrator] ${message}`);
      return { spark: false, sedona: false, message };
    }
  }

  /**
   * Run a job manually
   */
  async runJob(jobName: string): Promise<JobRun> {
    const job = this.jobs.get(jobName);
    if (!job) {
      throw new Error(`Job not found: ${jobName}`);
    }

    if (this.activeRuns.has(jobName)) {
      throw new Error(`Job already running: ${jobName}`);
    }

    return this.executeJob(job);
  }

  /**
   * Run all GPS analytics jobs
   */
  async runAllJobs(): Promise<JobRun[]> {
    const results: JobRun[] = [];
    
    for (const job of this.jobs.values()) {
      if (job.enabled) {
        try {
          const result = await this.executeJob(job);
          results.push(result);
        } catch (error) {
          logger.error(`[Sedona Orchestrator] Failed to run job ${job.name}:`, error);
        }
      }
    }

    return results;
  }

  /**
   * Get job status
   */
  getJobStatus(jobName: string): { config: JobConfig; schedule: JobSchedule; activeRun?: JobRun } | null {
    const config = this.jobs.get(jobName);
    const schedule = this.schedules.get(jobName);
    const activeRun = this.activeRuns.get(jobName);

    if (!config || !schedule) {
      return null;
    }

    return { config, schedule, activeRun };
  }

  /**
   * Get all job statuses
   */
  getAllJobStatuses(): Array<{ config: JobConfig; schedule: JobSchedule; activeRun?: JobRun }> {
    const statuses: Array<{ config: JobConfig; schedule: JobSchedule; activeRun?: JobRun }> = [];

    for (const [jobName, config] of this.jobs) {
      const schedule = this.schedules.get(jobName);
      const activeRun = this.activeRuns.get(jobName);
      
      if (schedule) {
        statuses.push({ config, schedule, activeRun });
      }
    }

    return statuses;
  }

  /**
   * Get run history
   */
  getRunHistory(limit: number = 50): JobRun[] {
    return this.runHistory.slice(-limit);
  }

  /**
   * Get health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    spark: boolean;
    sedona: boolean;
    schedulerRunning: boolean;
    activeJobs: number;
    recentFailures: number;
  }> {
    const availability = await this.checkSparkAvailability();
    
    const recentRuns = this.runHistory.filter(
      run => run.endTime && Date.now() - run.endTime.getTime() < 24 * 60 * 60 * 1000
    );
    const recentFailures = recentRuns.filter(run => run.status === 'failed' || run.status === 'timeout').length;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (!availability.spark) {
      status = 'unhealthy';
    } else if (!availability.sedona || recentFailures > 3) {
      status = 'degraded';
    }

    return {
      status,
      spark: availability.spark,
      sedona: availability.sedona,
      schedulerRunning: this.schedulerInterval !== null,
      activeJobs: this.activeRuns.size,
      recentFailures,
    };
  }

  /**
   * Enable/disable a job
   */
  setJobEnabled(jobName: string, enabled: boolean): boolean {
    const job = this.jobs.get(jobName);
    if (!job) {
      return false;
    }
    job.enabled = enabled;
    logger.info(`[Sedona Orchestrator] Job ${jobName} ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }

  /**
   * Check and run scheduled jobs
   */
  private checkAndRunScheduledJobs(): void {
    const now = new Date();

    for (const [jobName, schedule] of this.schedules) {
      const job = this.jobs.get(jobName);
      
      if (!job || !job.enabled) continue;
      if (this.activeRuns.has(jobName)) continue;
      
      if (schedule.nextRun <= now) {
        logger.info(`[Sedona Orchestrator] Running scheduled job: ${jobName}`);
        this.executeJob(job).catch(error => {
          logger.error(`[Sedona Orchestrator] Scheduled job failed: ${jobName}`, error);
        });
        
        // Update next run time
        schedule.nextRun = this.calculateNextRun(job.schedule);
      }
    }
  }

  /**
   * Execute a job with retry logic
   */
  private async executeJob(job: JobConfig, retryCount: number = 0): Promise<JobRun> {
    const runId = `${job.name}-${Date.now()}`;
    const run: JobRun = {
      id: runId,
      jobName: job.name,
      status: 'running',
      startTime: new Date(),
      retryCount,
    };

    this.activeRuns.set(job.name, run);
    logger.info(`[Sedona Orchestrator] Starting job: ${job.name} (attempt ${retryCount + 1}/${job.retries + 1})`);

    try {
      const scriptPath = path.join(
        process.cwd(),
        'services',
        'analytics-service',
        'gps',
        job.script
      );

      const result = await this.runCommand('python3', [scriptPath, ...job.args], job.timeout);

      if (result.success) {
        run.status = 'completed';
        run.output = result.output;
        logger.info(`[Sedona Orchestrator] Job completed: ${job.name}`);
      } else {
        throw new Error(result.error || 'Job execution failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('timeout')) {
        run.status = 'timeout';
      } else {
        run.status = 'failed';
      }
      run.error = errorMessage;

      logger.error(`[Sedona Orchestrator] Job failed: ${job.name}`, errorMessage);

      // Retry with exponential backoff
      if (retryCount < job.retries) {
        const backoffMs = Math.pow(2, retryCount) * 1000;
        logger.info(`[Sedona Orchestrator] Retrying job ${job.name} in ${backoffMs}ms`);
        
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        this.activeRuns.delete(job.name);
        return this.executeJob(job, retryCount + 1);
      }
    }

    run.endTime = new Date();
    run.duration = run.endTime.getTime() - run.startTime.getTime();

    // Update schedule
    const schedule = this.schedules.get(job.name);
    if (schedule) {
      schedule.lastRun = run.startTime;
      schedule.lastStatus = run.status === 'completed' ? 'completed' : 'failed';
    }

    // Store in history
    this.runHistory.push(run);
    if (this.runHistory.length > 1000) {
      this.runHistory = this.runHistory.slice(-500);
    }

    this.activeRuns.delete(job.name);
    return run;
  }

  /**
   * Run a command with timeout
   */
  private runCommand(
    command: string,
    args: string[],
    timeout: number
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    return new Promise((resolve) => {
      let output = '';
      let error = '';
      let killed = false;

      const proc = spawn(command, args, {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const timeoutId = setTimeout(() => {
        killed = true;
        proc.kill('SIGTERM');
        resolve({ success: false, error: 'Command timeout' });
      }, timeout);

      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        error += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        if (!killed) {
          resolve({
            success: code === 0,
            output: output.trim(),
            error: error.trim() || (code !== 0 ? `Exit code: ${code}` : undefined),
          });
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        if (!killed) {
          resolve({ success: false, error: err.message });
        }
      });
    });
  }

  /**
   * Calculate next run time from cron expression
   * Simplified implementation - supports basic patterns
   */
  private calculateNextRun(cronExpr: string): Date {
    const parts = cronExpr.split(' ');
    if (parts.length !== 5) {
      // Default to 1 hour from now if invalid
      return new Date(Date.now() + 60 * 60 * 1000);
    }

    const [minute, hour] = parts;
    const now = new Date();
    const next = new Date(now);

    // Parse minute
    if (minute.startsWith('*/')) {
      const interval = parseInt(minute.slice(2));
      const currentMinute = now.getMinutes();
      const nextMinute = Math.ceil((currentMinute + 1) / interval) * interval;
      if (nextMinute >= 60) {
        next.setHours(next.getHours() + 1);
        next.setMinutes(nextMinute - 60);
      } else {
        next.setMinutes(nextMinute);
      }
    } else if (minute !== '*') {
      next.setMinutes(parseInt(minute));
    }

    // Parse hour
    if (hour.startsWith('*/')) {
      const interval = parseInt(hour.slice(2));
      const currentHour = now.getHours();
      const nextHour = Math.ceil((currentHour + 1) / interval) * interval;
      if (nextHour >= 24) {
        next.setDate(next.getDate() + 1);
        next.setHours(nextHour - 24);
      } else {
        next.setHours(nextHour);
      }
    } else if (hour !== '*') {
      const targetHour = parseInt(hour);
      if (targetHour <= now.getHours()) {
        next.setDate(next.getDate() + 1);
      }
      next.setHours(targetHour);
    }

    next.setSeconds(0);
    next.setMilliseconds(0);

    // Ensure next run is in the future
    if (next <= now) {
      next.setTime(now.getTime() + 60 * 60 * 1000); // Default 1 hour
    }

    return next;
  }
}

// Singleton instance
export const sedonaOrchestrator = new SedonaJobOrchestrator();

// Auto-start scheduler if ENABLE_SEDONA_SCHEDULER env var is set
if (process.env.ENABLE_SEDONA_SCHEDULER === 'true') {
  sedonaOrchestrator.start();
  logger.info('[Sedona Orchestrator] Auto-started from environment variable');
}

export default sedonaOrchestrator;
