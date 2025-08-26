import { Queue, Worker, Job } from 'bullmq';
import { logger } from '../config/logger';

// BullMQ connection configuration  
const redisConfig = {
  host: process.env.REDIS_HOST || 'coolify-redis',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};
import { webhookProcessor } from './webhookProcessor';
import { syncService } from './syncService';
import { emailService } from './emailService';

export interface WebhookJobData {
  integrationId: string;
  provider: string;
  eventType: string;
  payload: any;
  signature?: string;
}

export interface SyncJobData {
  syncEventId: string;
  integrationId: string;
  sourceData: any;
}

export interface EmailJobData {
  to: string;
  subject: string;
  template: string;
  data: any;
}

// Job queues
export const webhookQueue = new Queue('webhook-processing', {
  connection: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const syncQueue = new Queue('sync-processing', {
  connection: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const emailQueue = new Queue('email-sending', {
  connection: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 25,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

// Workers
const webhookWorker = new Worker(
  'webhook-processing',
  async (job: Job<WebhookJobData>) => {
    logger.info(`Processing webhook job ${job.id}`);
    return await webhookProcessor.processWebhook(job.data);
  },
  { connection: redisConfig, concurrency: 5 }
);

const syncWorker = new Worker(
  'sync-processing',
  async (job: Job<SyncJobData>) => {
    logger.info(`Processing sync job ${job.id}`);
    return await syncService.processSyncEvent(job.data.syncEventId);
  },
  { connection: redisConfig, concurrency: 3 }
);

const emailWorker = new Worker(
  'email-sending',
  async (job: Job<EmailJobData>) => {
    logger.info(`Sending email job ${job.id}`);
    return await emailService.sendEmail(job.data);
  },
  { connection: redisConfig, concurrency: 2 }
);

// Event listeners
webhookWorker.on('completed', (job) => {
  logger.info(`Webhook job ${job.id} completed successfully`);
});

webhookWorker.on('failed', (job, err) => {
  logger.error(`Webhook job ${job?.id} failed:`, err);
});

syncWorker.on('completed', (job) => {
  logger.info(`Sync job ${job.id} completed successfully`);
});

syncWorker.on('failed', (job, err) => {
  logger.error(`Sync job ${job?.id} failed:`, err);
});

emailWorker.on('completed', (job) => {
  logger.info(`Email job ${job.id} completed successfully`);
});

emailWorker.on('failed', (job, err) => {
  logger.error(`Email job ${job?.id} failed:`, err);
});

export async function initializeJobQueue() {
  logger.info('✅ Job queue workers initialized');
}

export async function addWebhookJob(data: WebhookJobData, priority: number = 0) {
  return await webhookQueue.add('process-webhook', data, { priority });
}

export async function addSyncJob(data: SyncJobData, delay: number = 0) {
  return await syncQueue.add('process-sync', data, { delay });
}

export async function addEmailJob(data: EmailJobData, delay: number = 0) {
  return await emailQueue.add('send-email', data, { delay });
}

export async function getQueueStats() {
  const [webhookStats, syncStats, emailStats] = await Promise.all([
    {
      waiting: await webhookQueue.getWaiting(),
      active: await webhookQueue.getActive(),
      completed: await webhookQueue.getCompleted(),
      failed: await webhookQueue.getFailed(),
    },
    {
      waiting: await syncQueue.getWaiting(),
      active: await syncQueue.getActive(),
      completed: await syncQueue.getCompleted(),
      failed: await syncQueue.getFailed(),
    },
    {
      waiting: await emailQueue.getWaiting(),
      active: await emailQueue.getActive(),
      completed: await emailQueue.getCompleted(),
      failed: await emailQueue.getFailed(),
    },
  ]);

  return {
    webhook: {
      waiting: webhookStats.waiting.length,
      active: webhookStats.active.length,
      completed: webhookStats.completed.length,
      failed: webhookStats.failed.length,
    },
    sync: {
      waiting: syncStats.waiting.length,
      active: syncStats.active.length,
      completed: syncStats.completed.length,
      failed: syncStats.failed.length,
    },
    email: {
      waiting: emailStats.waiting.length,
      active: emailStats.active.length,
      completed: emailStats.completed.length,
      failed: emailStats.failed.length,
    },
  };
}