import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { AppError } from '../middleware/errorHandler';
import { webhookProcessor } from './webhookProcessor';
import { addSyncJob, addEmailJob } from './jobQueue';

export class SyncService {
  async processSyncEvent(syncEventId: string) {
    const syncEvent = await prisma.syncEvent.findUnique({
      where: { id: syncEventId },
      include: {
        integration: {
          include: {
            retellAccount: true,
            crmAccount: true,
            user: {
              select: {
                email: true,
                firstName: true,
                errorNotifications: true,
                successNotifications: true,
              },
            },
          },
        },
      },
    });

    if (!syncEvent) {
      throw new AppError('Sync event not found', 404);
    }

    try {
      // Update status to processing
      await prisma.syncEvent.update({
        where: { id: syncEventId },
        data: { status: 'processing' },
      });

      let result;
      
      switch (syncEvent.eventType) {
        case 'webhook_received':
          result = await webhookProcessor.triggerOutboundCall(syncEventId);
          break;
        case 'call_triggered':
          result = await this.handleCallTriggered(syncEvent);
          break;
        case 'sync_completed':
          result = await this.handleSyncCompleted(syncEvent);
          break;
        default:
          throw new AppError(`Unknown sync event type: ${syncEvent.eventType}`, 400);
      }

      // Send success notification if enabled
      if (syncEvent.integration.user.successNotifications && result.success) {
        await this.sendSuccessNotification(syncEvent);
      }

      logger.info(`Sync event ${syncEventId} processed successfully`);
      return result;

    } catch (error) {
      await this.handleSyncError(syncEvent, error);
      throw error;
    }
  }

  private async handleCallTriggered(syncEvent: any) {
    // This handles post-call processing if needed
    await prisma.syncEvent.update({
      where: { id: syncEvent.id },
      data: {
        status: 'completed',
        processedAt: new Date(),
      },
    });

    return { success: true, action: 'call_triggered' };
  }

  private async handleSyncCompleted(syncEvent: any) {
    // This handles final sync completion steps
    await prisma.syncEvent.update({
      where: { id: syncEvent.id },
      data: {
        status: 'completed',
        processedAt: new Date(),
      },
    });

    return { success: true, action: 'sync_completed' };
  }

  private async handleSyncError(syncEvent: any, error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const newRetryCount = syncEvent.retryCount + 1;
    const shouldRetry = newRetryCount <= syncEvent.maxRetries;

    await prisma.syncEvent.update({
      where: { id: syncEvent.id },
      data: {
        status: shouldRetry ? 'retrying' : 'failed',
        errorMessage,
        retryCount: newRetryCount,
      },
    });

    if (shouldRetry) {
      // Calculate exponential backoff delay
      const delay = Math.min(1000 * Math.pow(2, newRetryCount), 300000); // Max 5 minutes
      
      await addSyncJob({
        syncEventId: syncEvent.id,
        integrationId: syncEvent.integrationId,
        sourceData: syncEvent.sourceData,
      }, delay);

      logger.info(`Sync event ${syncEvent.id} scheduled for retry ${newRetryCount}/${syncEvent.maxRetries} in ${delay}ms`);
    } else {
      // Send error notification if enabled
      if (syncEvent.integration.user.errorNotifications) {
        await this.sendErrorNotification(syncEvent, errorMessage);
      }

      logger.error(`Sync event ${syncEvent.id} failed permanently after ${newRetryCount} retries`);
    }
  }

  private async sendSuccessNotification(syncEvent: any) {
    const emailData = {
      to: syncEvent.integration.user.email,
      subject: `Integration Success: ${syncEvent.integration.name}`,
      template: 'sync_success',
      data: {
        userName: syncEvent.integration.user.firstName || 'User',
        integrationName: syncEvent.integration.name,
        eventType: syncEvent.eventType,
        processedAt: new Date().toISOString(),
        callId: syncEvent.retellCallId,
      },
    };

    await addEmailJob(emailData);
  }

  private async sendErrorNotification(syncEvent: any, errorMessage: string) {
    const emailData = {
      to: syncEvent.integration.user.email,
      subject: `Integration Error: ${syncEvent.integration.name}`,
      template: 'sync_error',
      data: {
        userName: syncEvent.integration.user.firstName || 'User',
        integrationName: syncEvent.integration.name,
        errorMessage,
        eventType: syncEvent.eventType,
        retryCount: syncEvent.retryCount,
        failedAt: new Date().toISOString(),
        integrationId: syncEvent.integrationId,
      },
    };

    await addEmailJob(emailData);
  }

  async getSyncEvents(userId: string, filters: {
    integrationId?: string;
    status?: string;
    eventType?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (filters.integrationId) {
      where.integrationId = filters.integrationId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.eventType) {
      where.eventType = filters.eventType;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const [events, total] = await Promise.all([
      prisma.syncEvent.findMany({
        where,
        include: {
          integration: {
            select: { name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.syncEvent.count({ where }),
    ]);

    return {
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getSyncEventDetails(userId: string, syncEventId: string) {
    const syncEvent = await prisma.syncEvent.findFirst({
      where: { id: syncEventId, userId },
      include: {
        integration: {
          select: {
            name: true,
            retellAccount: { select: { provider: true, accountName: true } },
            crmAccount: { select: { provider: true, accountName: true } },
          },
        },
      },
    });

    if (!syncEvent) {
      throw new AppError('Sync event not found', 404);
    }

    return syncEvent;
  }

  async retrySyncEvent(userId: string, syncEventId: string) {
    const syncEvent = await prisma.syncEvent.findFirst({
      where: { id: syncEventId, userId, status: 'failed' },
    });

    if (!syncEvent) {
      throw new AppError('Failed sync event not found', 404);
    }

    // Reset retry count and queue for processing
    await prisma.syncEvent.update({
      where: { id: syncEventId },
      data: {
        status: 'pending',
        retryCount: 0,
        errorMessage: null,
      },
    });

    await addSyncJob({
      syncEventId,
      integrationId: syncEvent.integrationId,
      sourceData: syncEvent.sourceData,
    });

    return { success: true, message: 'Sync event queued for retry' };
  }

  async exportSyncEvents(userId: string, filters: {
    integrationId?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    format: 'csv' | 'pdf';
  }) {
    const where: any = { userId };

    if (filters.integrationId) where.integrationId = filters.integrationId;
    if (filters.status) where.status = filters.status;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const events = await prisma.syncEvent.findMany({
      where,
      include: {
        integration: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10000, // Limit for export
    });

    if (filters.format === 'csv') {
      return this.exportToCsv(events);
    } else {
      return this.exportToPdf(events);
    }
  }

  private exportToCsv(events: any[]) {
    const csvHeaders = [
      'ID',
      'Integration',
      'Event Type',
      'Status',
      'Call ID',
      'Error Message',
      'Retry Count',
      'Created At',
      'Processed At',
    ];

    const csvRows = events.map(event => [
      event.id,
      event.integration.name,
      event.eventType,
      event.status,
      event.retellCallId || '',
      event.errorMessage || '',
      event.retryCount,
      event.createdAt.toISOString(),
      event.processedAt?.toISOString() || '',
    ]);

    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    return {
      content: csvContent,
      filename: `sync-events-${new Date().toISOString().split('T')[0]}.csv`,
      contentType: 'text/csv',
    };
  }

  private async exportToPdf(events: any[]) {
    // This would use a PDF library like pdf-lib or puppeteer
    // For now, return a placeholder
    return {
      content: 'PDF export not implemented yet',
      filename: `sync-events-${new Date().toISOString().split('T')[0]}.pdf`,
      contentType: 'application/pdf',
    };
  }

  async getIntegrationHealth(userId: string, integrationId: string) {
    const [
      recentEvents,
      errorRate,
      averageProcessingTime,
      totalEvents,
    ] = await Promise.all([
      prisma.syncEvent.findMany({
        where: {
          userId,
          integrationId,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.calculateErrorRate(userId, integrationId),
      this.calculateAverageProcessingTime(userId, integrationId),
      prisma.syncEvent.count({ where: { userId, integrationId } }),
    ]);

    const status = this.determineHealthStatus(recentEvents, errorRate);

    return {
      status,
      totalEvents,
      recentEvents: recentEvents.length,
      errorRate,
      averageProcessingTime,
      lastProcessed: recentEvents[0]?.processedAt || null,
      recommendations: this.generateHealthRecommendations(status, errorRate, recentEvents),
    };
  }

  private async calculateErrorRate(userId: string, integrationId: string): Promise<number> {
    const [total, failed] = await Promise.all([
      prisma.syncEvent.count({
        where: {
          userId,
          integrationId,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
        },
      }),
      prisma.syncEvent.count({
        where: {
          userId,
          integrationId,
          status: 'failed',
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return total > 0 ? Math.round((failed / total) * 100) : 0;
  }

  private async calculateAverageProcessingTime(userId: string, integrationId: string): Promise<number> {
    const events = await prisma.syncEvent.findMany({
      where: {
        userId,
        integrationId,
        status: 'completed',
        processedAt: { not: null },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { createdAt: true, processedAt: true },
    });

    if (events.length === 0) return 0;

    const totalTime = events.reduce((sum, event) => {
      return sum + (event.processedAt!.getTime() - event.createdAt.getTime());
    }, 0);

    return Math.round(totalTime / events.length / 1000); // Return in seconds
  }

  private determineHealthStatus(recentEvents: any[], errorRate: number): 'healthy' | 'warning' | 'critical' {
    if (errorRate > 50) return 'critical';
    if (errorRate > 20) return 'warning';
    
    const recentFailures = recentEvents.filter(e => e.status === 'failed').length;
    if (recentFailures > 5) return 'warning';
    
    return 'healthy';
  }

  private generateHealthRecommendations(status: string, errorRate: number, recentEvents: any[]): string[] {
    const recommendations: string[] = [];

    if (status === 'critical') {
      recommendations.push('High error rate detected. Check integration configuration and account connections.');
    }

    if (errorRate > 20) {
      recommendations.push('Consider reviewing field mappings and trigger filters.');
    }

    const recentRetries = recentEvents.filter(e => e.retryCount > 0).length;
    if (recentRetries > 3) {
      recommendations.push('Multiple retries detected. Check for connectivity issues.');
    }

    if (recommendations.length === 0) {
      recommendations.push('Integration is performing well.');
    }

    return recommendations;
  }
}

export const syncService = new SyncService();