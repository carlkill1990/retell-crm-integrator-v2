import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { generateSecureToken } from '../utils/encryption';
import { retellService } from './retellService';
import { crmService } from './crmService';
import { config } from '../config';
import { WebhookManager } from './webhookManager';

export class IntegrationService {
  async createIntegration(userId: string, data: {
    name: string;
    description?: string;
    retellAccountId: string;
    crmAccountId: string;
    retellAgentId?: string;
    retellAgentName?: string;
    crmObject?: string;
    integrationType?: string;
    fieldMappings?: any[];
    triggerFilters?: any[];
    callConfiguration?: any;
    isDraft?: boolean;
  }) {
    // Verify accounts belong to user
    const [retellAccount, crmAccount] = await Promise.all([
      prisma.account.findFirst({
        where: { id: data.retellAccountId, userId, providerType: 'voice_ai' },
      }),
      prisma.account.findFirst({
        where: { id: data.crmAccountId, userId, providerType: 'crm' },
      }),
    ]);

    if (!retellAccount || !crmAccount) {
      throw new AppError('Invalid account selection', 400);
    }

    // Generate unique webhook URL and secret
    const webhookSecret = generateSecureToken(32);
    const webhookId = generateSecureToken(16);
    const isDraft = data.isDraft || false;
    
    // Generate unique webhook URL - for drafts, use a placeholder that won't conflict
    const initialWebhookUrl = isDraft ? `draft-placeholder-${generateSecureToken(16)}` : '';
    
    const integration = await prisma.integration.create({
      data: {
        userId,
        name: data.name,
        description: data.description,
        retellAccountId: data.retellAccountId,
        crmAccountId: data.crmAccountId,
        retellAgentId: data.retellAgentId,
        retellAgentName: data.retellAgentName,
        crmObject: data.crmObject,
        integrationType: data.integrationType,
        isDraft,
        isActive: !isDraft, // Draft integrations are not active
        currentStep: (data as any).currentStep || 1,
        webhookUrl: initialWebhookUrl, // Unique placeholder for drafts
        webhookSecret,
        fieldMappings: data.fieldMappings,
        triggerFilters: data.triggerFilters,
        callConfiguration: data.callConfiguration,
        businessWorkflows: (data as any).businessWorkflows || {},
      },
      include: {
        retellAccount: {
          select: { provider: true, accountName: true },
        },
        crmAccount: {
          select: { provider: true, accountName: true },
        },
      },
    });

    // Skip webhook configuration for draft integrations
    if (!isDraft) {
      // Now update with the correct webhook URL using the webhook manager
      const webhookUrl = WebhookManager.generateWebhookUrl(integration.id);
      await prisma.integration.update({
        where: { id: integration.id },
        data: { webhookUrl },
      });

      // Update Retell AI agent webhook URL if agent is specified
      if (data.retellAgentId) {
      try {
        // Use correct PATCH endpoint for updating agent webhook
        const axios = require('axios');
        const response = await axios.patch(`https://api.retellai.com/update-agent/${data.retellAgentId}`, {
          webhook_url: webhookUrl,
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.RETELL_API_KEY || 'key_0124889788939750c73b6ee70954'}`,
            'Content-Type': 'application/json',
          },
        });

        // Check if agent needs republishing
        const needsPublishing = !response.data.is_published;
        const agentVersion = response.data.version;

        // Store agent status in database for UI display
        await prisma.integration.update({
          where: { id: integration.id },
          data: {
            callConfiguration: {
              ...data.callConfiguration,
              agentStatus: {
                needsPublishing,
                currentVersion: agentVersion,
                lastWebhookUpdate: new Date().toISOString(),
                publishingRequired: needsPublishing ? 'Agent webhook updated to new version. Please publish the agent in Retell AI dashboard to activate for calls.' : null
              }
            }
          }
        });

        console.log(`✅ Updated Retell agent ${data.retellAgentId} webhook URL to: ${webhookUrl}`);
        if (needsPublishing) {
          console.log(`⚠️ IMPORTANT: Agent version ${agentVersion} needs to be published in Retell AI dashboard for calls to use the new webhook URL`);
        }
      } catch (error) {
        console.error(`❌ WEBHOOK UPDATE FAILED for agent ${data.retellAgentId}:`, (error as any).response?.data || (error as any).message);
        // Create integration anyway but return webhook failure warning
        const webhookError = (error as any).response?.data?.message || (error as any).message || 'Unknown error';
        return {
          ...integration,
          webhookUrl,
          webhookUpdateFailed: true,
          webhookError: `Failed to update Retell agent webhook: ${webhookError}. You'll need to manually copy the webhook URL to your Retell agent.`,
        };
      }
      }
    }

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'integration_created',
        resource: integration.id,
        details: { name: data.name, retellAccount: retellAccount.provider, crmAccount: crmAccount.provider },
      },
    });

    // Return integration with webhook URL (empty for drafts)
    return {
      ...integration,
      webhookUrl: isDraft ? '' : WebhookManager.generateWebhookUrl(integration.id),
    };
  }

  async publishDraftIntegration(userId: string, integrationId: string) {
    // Get the draft integration
    const integration = await prisma.integration.findFirst({
      where: { id: integrationId, userId, isDraft: true }
    });

    if (!integration) {
      throw new AppError('Draft integration not found', 404);
    }

    // Generate webhook URL
    const webhookUrl = WebhookManager.generateWebhookUrl(integration.id);

    // Update integration to live status
    await prisma.integration.update({
      where: { id: integrationId },
      data: {
        isDraft: false,
        isActive: true,
        webhookUrl
      }
    });

    // Update Retell agent webhook if specified
    if (integration.retellAgentId) {
      try {
        const axios = require('axios');
        await axios.patch(`https://api.retellai.com/update-agent/${integration.retellAgentId}`, {
          webhook_url: webhookUrl,
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.RETELL_API_KEY || 'key_0124889788939750c73b6ee70954'}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (error) {
        console.error(`Failed to update Retell agent webhook:`, error);
      }
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'draft_published',
        resource: integrationId,
        details: { name: integration.name }
      }
    });

    return await this.getIntegration(userId, integrationId);
  }

  async getIntegrations(userId: string, filters?: {
    isActive?: boolean;
    provider?: string;
  }) {
    const where: any = { userId };
    
    if (filters?.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    // Get start of today for filtering
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const integrations = await prisma.integration.findMany({
      where,
      include: {
        retellAccount: {
          select: { provider: true, accountName: true, accountEmail: true },
        },
        crmAccount: {
          select: { provider: true, accountName: true, accountEmail: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Add today's webhook count for each integration
    const integrationsWithWebhookCount = await Promise.all(
      integrations.map(async (integration) => {
        const webhookCountToday = await prisma.webhookEvent.count({
          where: {
            integrationId: integration.id,
            eventType: 'call_analyzed',
            createdAt: {
              gte: startOfToday,
            },
          },
        });

        return {
          ...integration,
          _count: {
            webhookEventsToday: webhookCountToday,
          },
        };
      })
    );

    // Add agent status for each integration with Retell agents
    const integrationsWithStatus = await Promise.all(
      integrationsWithWebhookCount.map(async (integration) => {
        if (!integration.retellAgentId) {
          return integration;
        }

        try {
          const axios = require('axios');
          const agentResponse = await axios.get(`https://api.retellai.com/get-agent/${integration.retellAgentId}`, {
            headers: {
              'Authorization': `Bearer ${process.env.RETELL_API_KEY || 'key_0124889788939750c73b6ee70954'}`,
              'Content-Type': 'application/json',
            },
          });

          const agentData = agentResponse.data;
          const needsPublishing = !agentData.is_published;
          const webhookMismatch = agentData.webhook_url !== integration.webhookUrl;

          return {
            ...integration,
            agentStatus: {
              needsPublishing,
              currentVersion: agentData.version,
              isPublished: agentData.is_published,
              webhookMismatch,
              hasWarnings: needsPublishing || webhookMismatch,
              warningCount: (needsPublishing ? 1 : 0) + (webhookMismatch ? 1 : 0)
            }
          };
        } catch (error) {
          return {
            ...integration,
            agentStatus: {
              error: 'Failed to check agent status',
              hasWarnings: true,
              warningCount: 1
            }
          };
        }
      })
    );

    return integrationsWithStatus;
  }

  async getIntegration(userId: string, integrationId: string) {
    const integration = await prisma.integration.findFirst({
      where: { id: integrationId, userId },
      include: {
        retellAccount: {
          select: { provider: true, accountName: true, accountEmail: true, accessToken: true },
        },
        crmAccount: {
          select: { provider: true, accountName: true, accountEmail: true },
        },
        syncEvents: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!integration) {
      throw new AppError('Integration not found', 404);
    }

    // Check current agent status if Retell agent is configured
    if (integration.retellAgentId) {
      try {
        const axios = require('axios');
        const agentResponse = await axios.get(`https://api.retellai.com/get-agent/${integration.retellAgentId}`, {
          headers: {
            'Authorization': `Bearer ${process.env.RETELL_API_KEY || 'key_0124889788939750c73b6ee70954'}`,
            'Content-Type': 'application/json',
          },
        });

        const agentData = agentResponse.data;
        const needsPublishing = !agentData.is_published;
        const currentWebhookUrl = agentData.webhook_url;
        const expectedWebhookUrl = integration.webhookUrl;
        const webhookMismatch = currentWebhookUrl !== expectedWebhookUrl;

        // Add real-time agent status to integration response
        const integrationWithStatus = {
          ...integration,
          agentStatus: {
            needsPublishing,
            currentVersion: agentData.version,
            isPublished: agentData.is_published,
            webhookMismatch,
            currentWebhookUrl,
            expectedWebhookUrl,
            lastChecked: new Date().toISOString(),
            warnings: [
              ...(needsPublishing ? ['⚠️ Agent needs to be published in Retell AI dashboard for calls to work properly'] : []),
              ...(webhookMismatch ? ['⚠️ Agent webhook URL doesn\'t match integration - calls may fail'] : [])
            ]
          }
        };

        return integrationWithStatus;
      } catch (error) {
        console.error('Failed to check agent status:', (error as any).message);
        return integration;
      }
    }

    return integration;
  }

  async updateIntegration(userId: string, integrationId: string, data: {
    name?: string;
    description?: string;
    retellAgentId?: string;
    crmObject?: string;
    integrationType?: string;
    fieldMappings?: any[];
    triggerFilters?: any[];
    callConfiguration?: any;
    businessWorkflows?: any[];
    isActive?: boolean;
    currentStep?: number;
  }) {
    const integration = await prisma.integration.findFirst({
      where: { id: integrationId, userId },
    });

    if (!integration) {
      throw new AppError('Integration not found', 404);
    }

    const updatedIntegration = await prisma.integration.update({
      where: { id: integrationId },
      data,
      include: {
        retellAccount: {
          select: { provider: true, accountName: true },
        },
        crmAccount: {
          select: { provider: true, accountName: true },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'integration_updated',
        resource: integrationId,
        details: data,
      },
    });

    return updatedIntegration;
  }

  async deleteIntegration(userId: string, integrationId: string) {
    const integration = await prisma.integration.findFirst({
      where: { id: integrationId, userId },
      include: {
        retellAccount: true,
      },
    });

    if (!integration) {
      throw new AppError('Integration not found', 404);
    }

    // Clear webhook URL from Retell AI agent if agent is specified
    if (integration.retellAgentId && integration.retellAccountId) {
      try {
        // Use correct PATCH endpoint to clear agent webhook
        const axios = require('axios');
        const response = await axios.patch(`https://api.retellai.com/update-agent/${integration.retellAgentId}`, {
          webhook_url: '',
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.RETELL_API_KEY || 'key_0124889788939750c73b6ee70954'}`,
            'Content-Type': 'application/json',
          },
        });
        console.log(`✅ Cleared webhook URL for Retell agent ${integration.retellAgentId}`);
      } catch (error) {
        console.error(`⚠️ Failed to clear Retell agent webhook:`, (error as any).response?.data || (error as any).message);
        // Don't fail the integration deletion if webhook clearing fails
      }
    }

    await prisma.integration.delete({
      where: { id: integrationId },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'integration_deleted',
        resource: integrationId,
        details: { name: integration.name },
      },
    });
  }

  async getAvailableFields(userId: string, accountId: string, objectType: string) {
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId },
    });

    if (!account) {
      throw new AppError('Account not found', 404);
    }

    if (account.providerType === 'voice_ai') {
      // Return standard Retell AI fields
      return [
        { name: 'customer_name', label: 'Customer Name', type: 'string', required: false },
        { name: 'customer_phone', label: 'Customer Phone', type: 'phone', required: true },
        { name: 'customer_email', label: 'Customer Email', type: 'email', required: false },
        { name: 'company_name', label: 'Company Name', type: 'string', required: false },
        { name: 'lead_source', label: 'Lead Source', type: 'string', required: false },
        { name: 'lead_score', label: 'Lead Score', type: 'number', required: false },
        { name: 'notes', label: 'Notes', type: 'text', required: false },
        { name: 'custom_data', label: 'Custom Data', type: 'object', required: false },
      ];
    } else {
      // Get fields from CRM
      return await crmService.getFields(accountId, account.provider, objectType);
    }
  }

  async getRetellAgents(userId: string, accountId: string) {
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId, providerType: 'voice_ai' },
    });

    if (!account) {
      throw new AppError('Retell account not found', 404);
    }

    return await retellService.getAgents(accountId);
  }

  async getRetellAgentsWithPurposes(userId: string, accountId: string) {
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId, providerType: 'voice_ai' },
    });

    if (!account) {
      throw new AppError('Retell account not found', 404);
    }

    return await retellService.getAgentsWithPurposes(accountId);
  }

  async testIntegration(userId: string, integrationId: string) {
    const integration = await prisma.integration.findFirst({
      where: { id: integrationId, userId },
      include: {
        retellAccount: true,
        crmAccount: true,
      },
    });

    if (!integration) {
      throw new AppError('Integration not found', 404);
    }

    try {
      // Test CRM connection
      const crmData = await crmService.getLeads(
        integration.crmAccountId, 
        integration.crmAccount.provider, 
        1
      );

      // Test Retell connection
      const retellAgents = await retellService.getAgents(integration.retellAccountId);

      // Validate configuration
      const validationResults = this.validateIntegrationConfiguration(integration);

      return {
        crmConnection: { status: 'success', recordCount: crmData.length },
        retellConnection: { status: 'success', agentCount: retellAgents.length },
        configuration: validationResults,
        overall: validationResults.isValid ? 'success' : 'warning',
      };
    } catch (error) {
      return {
        crmConnection: { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
        retellConnection: { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
        configuration: { isValid: false, errors: ['Connection test failed'] },
        overall: 'error',
      };
    }
  }

  private validateIntegrationConfiguration(integration: any) {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!integration.retellAgentId) {
      errors.push('Retell AI agent not selected');
    }

    if (!integration.crmObject) {
      warnings.push('CRM object type not specified');
    }

    // Validate field mappings
    if (!integration.fieldMappings || integration.fieldMappings.length === 0) {
      warnings.push('No field mappings configured');
    } else {
      const phoneMapping = integration.fieldMappings.find((m: any) => 
        m.retellField === 'customer_phone'
      );
      if (!phoneMapping) {
        errors.push('Phone number mapping is required for outbound calls');
      }
    }

    // Validate call configuration
    if (!integration.callConfiguration || !integration.callConfiguration.agentId) {
      errors.push('Call configuration missing or incomplete');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async getIntegrationStats(userId: string, integrationId: string, period: string = '7d') {
    const integration = await prisma.integration.findFirst({
      where: { id: integrationId, userId },
    });

    if (!integration) {
      throw new AppError('Integration not found', 404);
    }

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

    const [
      totalEvents,
      successfulEvents,
      failedEvents,
      retryingEvents,
      callsTriggered,
    ] = await Promise.all([
      prisma.syncEvent.count({
        where: { integrationId, createdAt: { gte: startDate, lte: endDate } },
      }),
      prisma.syncEvent.count({
        where: { 
          integrationId, 
          status: 'completed',
          createdAt: { gte: startDate, lte: endDate }
        },
      }),
      prisma.syncEvent.count({
        where: { 
          integrationId, 
          status: 'failed',
          createdAt: { gte: startDate, lte: endDate }
        },
      }),
      prisma.syncEvent.count({
        where: { 
          integrationId, 
          status: 'retrying',
          createdAt: { gte: startDate, lte: endDate }
        },
      }),
      prisma.syncEvent.count({
        where: { 
          integrationId, 
          eventType: 'call_triggered',
          createdAt: { gte: startDate, lte: endDate }
        },
      }),
    ]);

    const successRate = totalEvents > 0 ? Math.round((successfulEvents / totalEvents) * 100) : 0;

    return {
      period,
      startDate,
      endDate,
      totalEvents,
      successfulEvents,
      failedEvents,
      retryingEvents,
      callsTriggered,
      successRate,
    };
  }
}

export const integrationService = new IntegrationService();