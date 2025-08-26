import { Router } from 'express';
import { prisma } from '../config/database';
import { catchAsync } from '../middleware/errorHandler';
import { validateRequest } from '../utils/validation';
import { updateUserProfileSchema } from '../utils/validation';
import { comparePassword, hashPassword } from '../utils/encryption';

const router = Router();

router.get(
  '/profile',
  catchAsync(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        stripeCustomerId: true,
        trialEndsAt: true,
        emailNotifications: true,
        inAppNotifications: true,
        errorNotifications: true,
        successNotifications: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({
      success: true,
      data: user,
    });
  })
);

router.put(
  '/profile',
  validateRequest(updateUserProfileSchema),
  catchAsync(async (req, res) => {
    const updatedUser = await prisma.user.update({
      where: { id: req.user!.id },
      data: req.body,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        emailNotifications: true,
        inAppNotifications: true,
        errorNotifications: true,
        successNotifications: true,
        updatedAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'profile_updated',
        details: req.body,
      },
    });

    res.json({
      success: true,
      data: updatedUser,
      message: 'Profile updated successfully',
    });
  })
);

router.get(
  '/statistics',
  catchAsync(async (req, res) => {
    const userId = req.user!.id;

    // Get user integrations to filter webhook events
    const userIntegrations = await prisma.integration.findMany({
      where: { userId },
      select: { id: true }
    });
    const integrationIds = userIntegrations.map(i => i.id);

    const [
      totalIntegrations,
      activeIntegrations,
      connectedAccounts,
    ] = await Promise.all([
      prisma.integration.count({ where: { userId } }),
      prisma.integration.count({ where: { userId, isActive: true } }),
      prisma.account.count({ where: { userId, isActive: true } }),
    ]);

    // Get webhook events instead of sync events for real data
    const webhookEvents = await prisma.webhookEvent.findMany({
      where: { 
        integrationId: { in: integrationIds },
        processed: true 
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // Get more to group by calls
    });

    // Manually get integration names
    const integrationMap = new Map();
    for (const integration of userIntegrations) {
      const fullIntegration = await prisma.integration.findUnique({
        where: { id: integration.id },
        select: { name: true }
      });
      if (fullIntegration) {
        integrationMap.set(integration.id, fullIntegration.name);
      }
    }

    // Group webhook events by call_id to create meaningful call activities
    const callGroups: Record<string, any> = {};
    webhookEvents.forEach(event => {
      const call = (event.payload as any)?.call || (event.payload as any);
      const callId = call?.call_id;
      
      if (callId) {
        if (!callGroups[callId]) {
          callGroups[callId] = {
            id: callId,
            agentName: call.agent_name || call.agent_id || 'Unknown Agent',
            direction: call.direction || (call.from_number && call.to_number && call.from_number.startsWith('+447') ? 'inbound' : 'outbound'),
            fromNumber: call.from_number,
            toNumber: call.to_number,
            duration: null,
            status: 'ongoing',
            createdAt: event.createdAt,
            integrationName: integrationMap.get(event.integrationId) || 'Unknown Integration',
            eventTypes: []
          };
        }
        
        callGroups[callId].eventTypes.push(event.eventType);
        
        // Update with call_ended data
        if (event.eventType === 'call_ended' && call.duration_ms) {
          callGroups[callId].duration = Math.round(call.duration_ms / 1000);
          callGroups[callId].status = 'completed';
        }
      }
    });

    // Filter for calls in the last 24 hours only
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCalls = Object.values(callGroups)
      .filter((call: any) => new Date(call.createdAt) > last24Hours)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Count total calls processed (successful webhook processing)
    const totalCalls = Object.keys(callGroups).length;
    const completedCalls = Object.values(callGroups).filter((call: any) => call.status === 'completed').length;
    
    // System health based on recent webhook processing
    const recentWebhooks = webhookEvents.filter(e => 
      new Date(e.createdAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
    );
    const systemHealth = recentWebhooks.length > 0 && recentWebhooks.every(w => w.processed) ? 'Operational' : 'Check Required';

    const statistics = {
      integrations: {
        total: totalIntegrations,
        active: activeIntegrations,
        inactive: totalIntegrations - activeIntegrations,
      },
      calls: {
        total: totalCalls,
        completed: completedCalls,
        ongoing: totalCalls - completedCalls,
      },
      connectedAccounts,
      systemHealth,
      recentActivity: recentCalls,
    };

    res.json({
      success: true,
      data: statistics,
    });
  })
);

router.get(
  '/activity',
  catchAsync(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [auditLogs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where: { userId: req.user!.id } }),
    ]);

    res.json({
      success: true,
      data: auditLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

// NEW comprehensive activity feed for Activity page (does NOT affect dashboard)
router.get(
  '/activity-feed',
  catchAsync(async (req, res) => {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;
    const filter = req.query.filter as string; // 'all', 'calls', 'settings'
    const dateParam = req.query.date as string;

    // Parse date filter (defaults to today)
    const selectedDate = dateParam ? new Date(dateParam) : new Date();
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get user integrations for filtering
    const userIntegrations = await prisma.integration.findMany({
      where: { userId },
      select: { id: true, name: true }
    });
    const integrationIds = userIntegrations.map(i => i.id);
    const integrationMap = new Map(userIntegrations.map(i => [i.id, i.name]));

    const activities: any[] = [];

    // 1. Get call-related activities (WebhookEvents + SyncEvents)
    if (filter !== 'settings') {
      const webhookEvents = await prisma.webhookEvent.findMany({
        where: { 
          integrationId: { in: integrationIds },
          processed: true,
          eventType: { in: ['call_started', 'call_ended', 'call_analyzed'] },
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: filter === 'calls' ? limit : Math.floor(limit * 0.7),
        skip: filter === 'calls' ? skip : 0,
      });

      // Get related sync events for webhook events
      const callIds = webhookEvents.map(w => (w.payload as any)?.call?.call_id).filter(Boolean);
      const syncEvents = await prisma.syncEvent.findMany({
        where: {
          retellCallId: { in: callIds },
          userId
        },
      });

      const syncEventMap = new Map(syncEvents.map(s => [s.retellCallId, s]));

      // Transform webhook events to user-friendly activities
      webhookEvents.forEach(event => {
        const call = (event.payload as any)?.call || (event.payload as any);
        const callId = call?.call_id;
        const syncEvent = syncEventMap.get(callId);
        const integrationName = integrationMap.get(event.integrationId || '') || 'Unknown Integration';

        let activityText = '';
        let status = 'completed';
        let statusText = '';

        if (event.eventType === 'call_started') {
          const direction = call?.direction || 'inbound';
          const fromNumber = call?.from_number ? call.from_number.replace(/^\+1/, '') : 'Unknown';
          activityText = `${direction === 'inbound' ? 'Incoming' : 'Outgoing'} call from ${fromNumber}`;
          status = 'processing';
          statusText = 'In progress';
        } 
        else if (event.eventType === 'call_ended') {
          const direction = call?.direction || 'inbound';
          const fromNumber = call?.from_number ? call.from_number.replace(/^\+1/, '') : 'Unknown';
          const duration = call?.duration_ms ? Math.round(call.duration_ms / 1000) : null;
          activityText = `${direction === 'inbound' ? 'Incoming' : 'Outgoing'} call completed`;
          
          if (syncEvent) {
            if (syncEvent.status === 'completed') {
              status = 'success';
              statusText = 'Saved to CRM';
            } else if (syncEvent.status === 'failed') {
              status = 'failed';
              statusText = 'Failed to save to CRM';
            } else {
              status = 'processing';
              statusText = 'Saving to CRM...';
            }
          } else {
            status = 'processing';
            statusText = 'Processing...';
          }
        }
        else if (event.eventType === 'call_analyzed') {
          status = 'success';
          statusText = 'Analysis completed';
          activityText = 'Call analysis completed';
        }

        activities.push({
          id: `webhook_${event.id}`,
          type: 'call',
          title: activityText,
          status,
          statusText,
          integration: integrationName,
          phoneNumber: call?.from_number,
          duration: call?.duration_ms ? Math.round(call.duration_ms / 1000) : null,
          errorMessage: syncEvent?.errorMessage,
          createdAt: event.createdAt,
          details: {
            callId: callId,
            direction: call?.direction,
            agentName: call?.agent_name
          }
        });
      });
    }

    // 2. Get system/settings activities (AuditLogs)
    if (filter !== 'calls') {
      const auditLogs = await prisma.auditLog.findMany({
        where: { 
          userId,
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: filter === 'settings' ? limit : Math.floor(limit * 0.3),
        skip: filter === 'settings' ? skip : 0,
      });

      auditLogs.forEach(log => {
        let activityText = '';
        
        switch (log.action) {
          case 'profile_updated':
            activityText = 'Updated your profile';
            break;
          case 'integration_created':
            activityText = `Created integration "${(log.details as any)?.name || 'New Integration'}"`;
            break;
          case 'integration_updated':
            activityText = `Updated integration "${(log.details as any)?.name || 'Integration'}"`;
            break;
          case 'integration_deleted':
            activityText = `Deleted integration "${(log.details as any)?.name || 'Integration'}"`;
            break;
          case 'account_connected':
            activityText = `Connected ${(log.details as any)?.provider || 'account'}`;
            break;
          case 'account_disconnected':
            activityText = `Disconnected ${(log.details as any)?.provider || 'account'}`;
            break;
          default:
            activityText = log.action.replace('_', ' ');
        }

        activities.push({
          id: `audit_${log.id}`,
          type: 'system',
          title: activityText,
          status: 'completed',
          statusText: 'Completed',
          integration: null,
          createdAt: log.createdAt,
          details: log.details
        });
      });
    }

    // Sort all activities by creation time
    activities.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Apply pagination to combined results
    const paginatedActivities = activities.slice(skip, skip + limit);
    const total = activities.length;

    res.json({
      success: true,
      data: paginatedActivities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

router.put(
  '/password',
  catchAsync(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters long',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Verify current password
    const isValidPassword = await comparePassword(currentPassword, user.password);
    
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect',
      });
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    // Log the password change
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'password_changed',
        details: { timestamp: new Date() },
      },
    });

    res.json({
      success: true,
      message: 'Password updated successfully',
    });
  })
);

router.delete(
  '/account',
  catchAsync(async (req, res) => {
    const userId = req.user!.id;

    // Check for active integrations
    const activeIntegrations = await prisma.integration.count({
      where: { userId, isActive: true },
    });

    if (activeIntegrations > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete account with active integrations. Please disable all integrations first.',
      });
    }

    // Delete user and all related data (cascading deletes via Prisma schema)
    await prisma.user.delete({
      where: { id: userId },
    });

    res.json({
      success: true,
      message: 'Account deleted successfully',
    });
  })
);

export default router;