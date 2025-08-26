import { Router } from 'express';
import { integrationService } from '../services/integrationService';
import { businessLogicEngine } from '../services/businessLogicEngine';
import { catchAsync } from '../middleware/errorHandler';
import { validateRequest, validateQuery } from '../utils/validation';
import { integrationSchema, paginationSchema } from '../utils/validation';

const router = Router();

// Temporary debug endpoint to check webhook event types
router.get(
  '/debug/webhook-events',
  catchAsync(async (req, res) => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const eventTypes = await require('../config/database').prisma.webhookEvent.findMany({
      where: {
        createdAt: { gte: startOfToday }
      },
      select: {
        eventType: true,
        integrationId: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: eventTypes });
  })
);

router.get(
  '/',
  validateQuery(paginationSchema),
  catchAsync(async (req, res) => {
    const filters = {
      isActive: req.query.isActive ? req.query.isActive === 'true' : undefined,
      provider: req.query.provider as string,
    };

    const integrations = await integrationService.getIntegrations(req.user!.id, filters);

    res.json({
      success: true,
      data: integrations,
    });
  })
);

router.post(
  '/',
  validateRequest(integrationSchema),
  catchAsync(async (req, res) => {
    const integration = await integrationService.createIntegration(req.user!.id, req.body);

    res.status(201).json({
      success: true,
      data: integration,
      message: 'Integration created successfully',
    });
  })
);

router.get(
  '/:integrationId',
  catchAsync(async (req, res) => {
    const integration = await integrationService.getIntegration(
      req.user!.id,
      req.params.integrationId
    );

    res.json({
      success: true,
      data: integration,
    });
  })
);

router.put(
  '/:integrationId',
  catchAsync(async (req, res) => {
    const integration = await integrationService.updateIntegration(
      req.user!.id,
      req.params.integrationId,
      req.body
    );

    res.json({
      success: true,
      data: integration,
      message: 'Integration updated successfully',
    });
  })
);

router.post(
  '/:integrationId/publish',
  catchAsync(async (req, res) => {
    const integration = await integrationService.publishDraftIntegration(
      req.user!.id,
      req.params.integrationId
    );

    res.json({
      success: true,
      data: integration,
      message: 'Draft integration published successfully',
    });
  })
);

router.delete(
  '/:integrationId',
  catchAsync(async (req, res) => {
    await integrationService.deleteIntegration(req.user!.id, req.params.integrationId);

    res.json({
      success: true,
      message: 'Integration deleted successfully',
    });
  })
);

router.post(
  '/:integrationId/test',
  catchAsync(async (req, res) => {
    const testResults = await integrationService.testIntegration(
      req.user!.id,
      req.params.integrationId
    );

    res.json({
      success: true,
      data: testResults,
    });
  })
);

router.get(
  '/:integrationId/stats',
  catchAsync(async (req, res) => {
    const period = req.query.period as string || '7d';
    
    const stats = await integrationService.getIntegrationStats(
      req.user!.id,
      req.params.integrationId,
      period
    );

    res.json({
      success: true,
      data: stats,
    });
  })
);

// Wizard endpoints for setup
router.get(
  '/wizard/agents/:accountId',
  catchAsync(async (req, res) => {
    const agents = await integrationService.getRetellAgents(
      req.user!.id,
      req.params.accountId
    );

    res.json({
      success: true,
      data: agents,
    });
  })
);

router.get(
  '/wizard/agents-with-purposes/:accountId',
  catchAsync(async (req, res) => {
    const agents = await integrationService.getRetellAgentsWithPurposes(
      req.user!.id,
      req.params.accountId
    );

    res.json({
      success: true,
      data: agents,
    });
  })
);

router.get(
  '/wizard/fields/:accountId',
  catchAsync(async (req, res) => {
    const objectType = req.query.objectType as string || 'leads';
    
    const fields = await integrationService.getAvailableFields(
      req.user!.id,
      req.params.accountId,
      objectType
    );

    res.json({
      success: true,
      data: fields,
    });
  })
);

router.post(
  '/:integrationId/toggle',
  catchAsync(async (req, res) => {
    const { isActive } = req.body;

    const integration = await integrationService.updateIntegration(
      req.user!.id,
      req.params.integrationId,
      { isActive }
    );

    res.json({
      success: true,
      data: integration,
      message: `Integration ${isActive ? 'activated' : 'deactivated'} successfully`,
    });
  })
);

router.post(
  '/:integrationId/duplicate',
  catchAsync(async (req, res) => {
    const originalIntegration = await integrationService.getIntegration(
      req.user!.id,
      req.params.integrationId
    );

    const duplicateData = {
      name: `${originalIntegration.name} (Copy)`,
      description: originalIntegration.description || undefined,
      retellAccountId: originalIntegration.retellAccountId,
      crmAccountId: originalIntegration.crmAccountId,
      retellAgentId: originalIntegration.retellAgentId || undefined,
      crmObject: originalIntegration.crmObject || undefined,
      fieldMappings: originalIntegration.fieldMappings as any,
      triggerFilters: originalIntegration.triggerFilters as any,
      callConfiguration: originalIntegration.callConfiguration as any,
    };

    const newIntegration = await integrationService.createIntegration(
      req.user!.id,
      duplicateData
    );

    res.status(201).json({
      success: true,
      data: newIntegration,
      message: 'Integration duplicated successfully',
    });
  })
);

// Template and smart mapping endpoints
router.post(
  '/:integrationId/templates/consultation-booking',
  catchAsync(async (req, res) => {
    await businessLogicEngine.applyConsultationBookingTemplate(req.params.integrationId);

    res.json({
      success: true,
      message: 'Consultation booking template applied successfully',
    });
  })
);

router.post(
  '/analyze-webhook-fields',
  catchAsync(async (req, res) => {
    const { webhookData } = req.body;

    if (!webhookData) {
      return res.status(400).json({
        success: false,
        error: 'Webhook data is required',
      });
    }

    const detectedFields = businessLogicEngine.analyzeWebhookFields(webhookData);

    res.json({
      success: true,
      data: { detectedFields },
    });
  })
);

export default router;