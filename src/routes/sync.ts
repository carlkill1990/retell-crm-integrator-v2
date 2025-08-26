import { Router } from 'express';
import { syncService } from '../services/syncService';
import { catchAsync } from '../middleware/errorHandler';
import { validateQuery } from '../utils/validation';
import { syncEventFilterSchema } from '../utils/validation';

const router = Router();

router.get(
  '/events',
  validateQuery(syncEventFilterSchema),
  catchAsync(async (req, res) => {
    const filters = {
      integrationId: req.query.integrationId as string,
      status: req.query.status as string,
      eventType: req.query.eventType as string,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      page: req.query.page as number,
      limit: req.query.limit as number,
    };

    const result = await syncService.getSyncEvents(req.user!.id, filters);

    res.json({
      success: true,
      data: result.events,
      pagination: result.pagination,
    });
  })
);

router.get(
  '/events/:syncEventId',
  catchAsync(async (req, res) => {
    const syncEvent = await syncService.getSyncEventDetails(
      req.user!.id,
      req.params.syncEventId
    );

    res.json({
      success: true,
      data: syncEvent,
    });
  })
);

router.post(
  '/events/:syncEventId/retry',
  catchAsync(async (req, res) => {
    const result = await syncService.retrySyncEvent(
      req.user!.id,
      req.params.syncEventId
    );

    res.json({
      success: true,
      data: result,
      message: 'Sync event retry initiated',
    });
  })
);

router.get(
  '/export',
  catchAsync(async (req, res) => {
    const filters = {
      integrationId: req.query.integrationId as string,
      status: req.query.status as string,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      format: (req.query.format as 'csv' | 'pdf') || 'csv',
    };

    const exportResult = await syncService.exportSyncEvents(req.user!.id, filters);

    res.set({
      'Content-Type': exportResult.contentType,
      'Content-Disposition': `attachment; filename="${exportResult.filename}"`,
    });

    res.send(exportResult.content);
  })
);

router.get(
  '/health/:integrationId',
  catchAsync(async (req, res) => {
    const health = await syncService.getIntegrationHealth(
      req.user!.id,
      req.params.integrationId
    );

    res.json({
      success: true,
      data: health,
    });
  })
);

router.get(
  '/statistics',
  catchAsync(async (req, res) => {
    const period = req.query.period as string || '7d';
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    const userId = req.user!.id;

    const [
      totalEvents,
      successfulEvents,
      failedEvents,
      retriedEvents,
      avgProcessingTime,
      topIntegrations,
      eventsByType,
    ] = await Promise.all([
      require('../config/database').prisma.syncEvent.count({
        where: { userId, createdAt: { gte: startDate, lte: endDate } },
      }),
      require('../config/database').prisma.syncEvent.count({
        where: { userId, status: 'completed', createdAt: { gte: startDate, lte: endDate } },
      }),
      require('../config/database').prisma.syncEvent.count({
        where: { userId, status: 'failed', createdAt: { gte: startDate, lte: endDate } },
      }),
      require('../config/database').prisma.syncEvent.count({
        where: { userId, retryCount: { gt: 0 }, createdAt: { gte: startDate, lte: endDate } },
      }),
      require('../config/database').prisma.syncEvent.findMany({
        where: {
          userId,
          status: 'completed',
          processedAt: { not: null },
          createdAt: { gte: startDate, lte: endDate },
        },
        select: { createdAt: true, processedAt: true },
      }).then((events: any[]) => {
        if (events.length === 0) return 0;
        const totalTime = events.reduce((sum, event) => {
          return sum + (event.processedAt!.getTime() - event.createdAt.getTime());
        }, 0);
        return Math.round(totalTime / events.length / 1000); // seconds
      }),
      require('../config/database').prisma.syncEvent.groupBy({
        by: ['integrationId'],
        where: { userId, createdAt: { gte: startDate, lte: endDate } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }).then(async (results: any[]) => {
        const integrationIds = results.map(r => r.integrationId);
        const integrations = await require('../config/database').prisma.integration.findMany({
          where: { id: { in: integrationIds } },
          select: { id: true, name: true },
        });
        
        return results.map(result => ({
          integration: integrations.find(i => i.id === result.integrationId)?.name || 'Unknown',
          count: result._count.id,
        }));
      }),
      require('../config/database').prisma.syncEvent.groupBy({
        by: ['eventType'],
        where: { userId, createdAt: { gte: startDate, lte: endDate } },
        _count: { id: true },
      }).then((results: any[]) => {
        return results.map(result => ({
          type: result.eventType,
          count: result._count.id,
        }));
      }),
    ]);

    const successRate = totalEvents > 0 ? Math.round((successfulEvents / totalEvents) * 100) : 0;

    const statistics = {
      period,
      totalEvents,
      successfulEvents,
      failedEvents,
      retriedEvents,
      successRate,
      avgProcessingTime,
      topIntegrations,
      eventsByType,
    };

    res.json({
      success: true,
      data: statistics,
    });
  })
);

export default router;