import { Router } from 'express';
import { WebhookManager } from '../services/webhookManager';
import { catchAsync } from '../middleware/errorHandler';
import { logger } from '../config/logger';

const router = Router();

/**
 * Update webhook base URL for all integrations
 * POST /api/admin/webhook-base-url
 */
router.post('/webhook-base-url', catchAsync(async (req, res) => {
  const { baseUrl } = req.body;

  if (!baseUrl) {
    return res.status(400).json({
      success: false,
      error: 'baseUrl is required'
    });
  }

  try {
    // Validate URL format
    new URL(baseUrl);
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'Invalid URL format'
    });
  }

  await WebhookManager.updateBaseUrl(baseUrl);

  res.json({
    success: true,
    message: 'Webhook base URL updated for all integrations',
    data: { baseUrl }
  });
}));

/**
 * Get current webhook base URL
 * GET /api/admin/webhook-base-url
 */
router.get('/webhook-base-url', catchAsync(async (req, res) => {
  const currentBaseUrl = WebhookManager.getCurrentBaseUrl();

  res.json({
    success: true,
    data: { baseUrl: currentBaseUrl }
  });
}));

/**
 * Auto-detect current tunnel and update all integrations
 * POST /api/admin/auto-update-tunnel
 */
router.post('/auto-update-tunnel', catchAsync(async (req, res) => {
  await WebhookManager.autoUpdateTunnel();

  res.json({
    success: true,
    message: 'Tunnel auto-update completed'
  });
}));

export default router;