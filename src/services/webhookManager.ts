import { prisma } from '../config/database';
import axios from 'axios';
import { logger } from '../config/logger';

export class WebhookManager {
  private static currentBaseUrl: string | null = null;

  /**
   * Update the base URL for all webhook endpoints
   * This automatically updates all active integrations
   */
  static async updateBaseUrl(newBaseUrl: string): Promise<void> {
    try {
      logger.info(`Updating webhook base URL to: ${newBaseUrl}`);

      // Get all active integrations
      const integrations = await prisma.integration.findMany({
        where: { isActive: true },
        include: {
          retellAccount: {
            select: { accessToken: true }
          }
        }
      });

      logger.info(`Found ${integrations.length} active integrations to update`);

      // Update each integration
      const updatePromises = integrations.map(async (integration) => {
        const newWebhookUrl = `${newBaseUrl}/api/webhooks/retell/${integration.id}`;
        
        try {
          // Update in database
          await prisma.integration.update({
            where: { id: integration.id },
            data: { webhookUrl: newWebhookUrl }
          });

          // Update Retell agent via API
          if (integration.retellAccount?.accessToken && integration.retellAgentId) {
            await axios.patch(`https://api.retellai.com/update-agent/${integration.retellAgentId}`, {
              webhook_url: newWebhookUrl
            }, {
              headers: {
                'Authorization': `Bearer ${integration.retellAccount.accessToken}`,
                'Content-Type': 'application/json'
              }
            });

            logger.info(`✅ Updated integration ${integration.id} - Agent ${integration.retellAgentId} - Webhook changes applied immediately`);
          }
        } catch (error) {
          logger.error(`❌ Failed to update integration ${integration.id}:`, error);
        }
      });

      await Promise.all(updatePromises);
      this.currentBaseUrl = newBaseUrl;
      
      logger.info(`🎉 Webhook base URL updated for all integrations`);
      
    } catch (error) {
      logger.error('Failed to update webhook base URL:', error);
      throw error;
    }
  }

  /**
   * Get current webhook base URL
   */
  static getCurrentBaseUrl(): string | null {
    return this.currentBaseUrl;
  }

  /**
   * Generate webhook URL for a specific integration
   */
  static generateWebhookUrl(integrationId: string, baseUrl?: string): string {
    const base = baseUrl || this.currentBaseUrl || process.env.API_BASE_URL;
    return `${base}/api/webhooks/retell/${integrationId}`;
  }

  /**
   * Initialize webhook manager with current tunnel status
   */
  static async initialize(): Promise<void> {
    try {
      // Try to detect current base URL from existing integrations
      const integration = await prisma.integration.findFirst({
        where: { isActive: true },
        select: { webhookUrl: true }
      });

      if (integration?.webhookUrl) {
        // Extract base URL from existing webhook URL
        const url = new URL(integration.webhookUrl);
        this.currentBaseUrl = `${url.protocol}//${url.host}`;
        logger.info(`Initialized webhook manager with base URL: ${this.currentBaseUrl}`);
      }
    } catch (error) {
      logger.error('Failed to initialize webhook manager:', error);
    }
  }

  /**
   * Auto-detect and update webhook URLs when tunnel changes
   */
  static async autoUpdateTunnel(): Promise<void> {
    try {
      // Check if current tunnel is still accessible
      if (this.currentBaseUrl) {
        try {
          await axios.get(`${this.currentBaseUrl}/health`, { timeout: 5000 });
          logger.info('Current tunnel is still accessible');
          return;
        } catch (error) {
          logger.warn('Current tunnel appears to be down, checking for new tunnel...');
        }
      }

      // TODO: Add logic to detect new tunnel URL
      // This could check process output, configuration files, etc.
      
    } catch (error) {
      logger.error('Failed to auto-update tunnel:', error);
    }
  }
}