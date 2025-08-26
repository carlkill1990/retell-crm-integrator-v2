import { Router } from 'express';
import { webhookProcessor } from '../services/webhookProcessor';
import { addWebhookJob } from '../services/jobQueue';
import { catchAsync, AppError } from '../middleware/errorHandler';
import { logger } from '../config/logger';

const router = Router();

// Generic webhook receiver for CRM providers
router.post(
  '/:webhookId',
  catchAsync(async (req, res) => {
    const { webhookId } = req.params;
    const signature = req.headers['x-signature'] as string || 
                     req.headers['x-hub-signature-256'] as string ||
                     req.headers['x-pipedrive-signature'] as string;

    // Extract provider from webhook or headers
    const provider = req.headers['x-provider'] as string || 
                    req.body.source || 
                    'unknown';

    const eventType = req.headers['x-event-type'] as string || 
                     req.body.event_type || 
                     req.body.event || 
                     'data_update';

    // Queue webhook for processing
    await addWebhookJob({
      integrationId: webhookId,
      provider,
      eventType,
      payload: req.body,
      signature,
    }, 1); // High priority for webhooks

    res.status(200).json({
      success: true,
      message: 'Webhook received and queued for processing',
    });
  })
);

// Pipedrive webhook receiver
router.post(
  '/pipedrive/:webhookId',
  catchAsync(async (req, res) => {
    const { webhookId } = req.params;
    const signature = req.headers['x-pipedrive-signature'] as string;

    await addWebhookJob({
      integrationId: webhookId,
      provider: 'pipedrive',
      eventType: req.body.event || 'data_update',
      payload: req.body,
      signature,
    }, 1);

    res.status(200).json({ success: true });
  })
);

// HubSpot webhook receiver
router.post(
  '/hubspot/:webhookId',
  catchAsync(async (req, res) => {
    const { webhookId } = req.params;
    const signature = req.headers['x-hubspot-signature'] as string;

    await addWebhookJob({
      integrationId: webhookId,
      provider: 'hubspot',
      eventType: req.body.subscriptionType || 'contact.creation',
      payload: req.body,
      signature,
    }, 1);

    res.status(200).json({ success: true });
  })
);

// Salesforce webhook receiver
router.post(
  '/salesforce/:webhookId',
  catchAsync(async (req, res) => {
    const { webhookId } = req.params;
    const signature = req.headers['x-salesforce-signature'] as string;

    await addWebhookJob({
      integrationId: webhookId,
      provider: 'salesforce',
      eventType: req.body.eventType || 'record_update',
      payload: req.body,
      signature,
    }, 1);

    res.status(200).json({ success: true });
  })
);

// Zoho webhook receiver
router.post(
  '/zoho/:webhookId',
  catchAsync(async (req, res) => {
    const { webhookId } = req.params;
    const signature = req.headers['x-zoho-signature'] as string;

    await addWebhookJob({
      integrationId: webhookId,
      provider: 'zoho',
      eventType: req.body.event_type || 'module_data_updated',
      payload: req.body,
      signature,
    }, 1);

    res.status(200).json({ success: true });
  })
);

// Retell AI webhook receiver (for call status updates)
router.post(
  '/retell/:integrationId',
  catchAsync(async (req, res) => {
    const { integrationId } = req.params;
    const signature = req.headers['x-retell-signature'] as string;

    // Debug: Log the raw request details
    logger.info('Retell webhook received:', {
      integrationId,
      headers: req.headers,
      bodyType: typeof req.body,
      bodyLength: JSON.stringify(req.body).length,
      rawBody: req.body
    });

    // Process Retell webhook directly (no queuing needed for status updates)
    await webhookProcessor.handleRetellWebhook(integrationId, req.body);

    res.status(200).json({ success: true });
  })
);

// Webhook validation endpoint for CRM providers
router.get(
  '/:webhookId/validate',
  catchAsync(async (req, res) => {
    const { webhookId } = req.params;
    const challenge = req.query.challenge || req.query['hub.challenge'];

    if (challenge) {
      // Return challenge for webhook validation (HubSpot, Facebook, etc.)
      res.status(200).send(challenge);
    } else {
      res.status(200).json({
        success: true,
        message: 'Webhook endpoint is active',
        webhookId,
        timestamp: new Date().toISOString(),
      });
    }
  })
);

// Manual webhook trigger for testing
router.post(
  '/:webhookId/test',
  catchAsync(async (req, res) => {
    const { webhookId } = req.params;
    const { provider = 'test', eventType = 'test_event', payload = {} } = req.body;

    await addWebhookJob({
      integrationId: webhookId,
      provider,
      eventType,
      payload: {
        ...payload,
        test: true,
        timestamp: new Date().toISOString(),
      },
    }, 1);

    res.status(200).json({
      success: true,
      message: 'Test webhook queued for processing',
    });
  })
);

// Get webhook logs for debugging
router.get(
  '/:webhookId/logs',
  catchAsync(async (req, res) => {
    const { webhookId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      // This would need proper authentication middleware in production
      require('../config/database').prisma.webhookEvent.findMany({
        where: { integrationId: webhookId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          provider: true,
          eventType: true,
          processed: true,
          createdAt: true,
          payload: true,
        },
      }),
      require('../config/database').prisma.webhookEvent.count({
        where: { integrationId: webhookId },
      }),
    ]);

    res.json({
      success: true,
      data: events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

// Health check for webhook endpoints
router.get(
  '/health',
  (req, res) => {
    res.status(200).json({
      status: 'healthy',
      service: 'webhook-receiver',
      timestamp: new Date().toISOString(),
    });
  }
);

export default router;