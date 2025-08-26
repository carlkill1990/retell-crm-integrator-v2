import axios from 'axios';
import { config } from '../config';
import { oauthService } from './oauthService';
import { AppError } from '../middleware/errorHandler';

export class RetellService {
  private async getApiClient(accountId: string) {
    const accessToken = await oauthService.getDecryptedAccessToken(accountId);
    return axios.create({
      baseURL: config.oauth.retell.apiBaseUrl,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async getAgents(accountId: string) {
    const client = await this.getApiClient(accountId);
    
    try {
      const response = await client.get('/list-agents');
      return response.data.data || response.data.agents || [];
    } catch (error) {
      throw new AppError('Failed to fetch Retell agents', 500);
    }
  }

  async getAgent(accountId: string, agentId: string) {
    const client = await this.getApiClient(accountId);
    
    try {
      const response = await client.get(`/v1/agent/${agentId}`);
      return response.data;
    } catch (error) {
      throw new AppError('Failed to fetch Retell agent', 500);
    }
  }

  async createCall(accountId: string, callData: {
    agentId: string;
    toNumber: string;
    fromNumber?: string;
    metadata?: Record<string, any>;
    webhookUrl?: string;
  }) {
    const client = await this.getApiClient(accountId);
    
    try {
      const response = await client.post('/v1/call', {
        agent_id: callData.agentId,
        to_number: callData.toNumber,
        from_number: callData.fromNumber,
        metadata: callData.metadata,
        webhook_url: callData.webhookUrl,
      });
      
      return response.data;
    } catch (error) {
      throw new AppError('Failed to create Retell call', 500);
    }
  }

  async getCall(accountId: string, callId: string) {
    const client = await this.getApiClient(accountId);
    
    try {
      const response = await client.get(`/v1/call/${callId}`);
      return response.data;
    } catch (error) {
      throw new AppError('Failed to fetch Retell call', 500);
    }
  }

  async getCalls(accountId: string, filters?: {
    agentId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }) {
    const client = await this.getApiClient(accountId);
    
    try {
      const requestBody: any = {};
      
      if (filters?.agentId) requestBody.agent_id = filters.agentId;
      if (filters?.startDate) requestBody.start_date = filters.startDate.toISOString();
      if (filters?.endDate) requestBody.end_date = filters.endDate.toISOString();
      if (filters?.limit) requestBody.limit = filters.limit;
      
      const response = await client.post('/v2/list-calls', requestBody);
      return response.data.data || response.data.calls || [];
    } catch (error) {
      throw new AppError('Failed to fetch Retell calls', 500);
    }
  }

  async getCallRecording(accountId: string, callId: string) {
    const client = await this.getApiClient(accountId);
    
    try {
      const response = await client.get(`/v1/call/${callId}/recording`);
      return response.data;
    } catch (error) {
      throw new AppError('Failed to fetch call recording', 500);
    }
  }

  async getCallTranscript(accountId: string, callId: string) {
    const client = await this.getApiClient(accountId);
    
    try {
      const response = await client.get(`/v1/call/${callId}/transcript`);
      return response.data;
    } catch (error) {
      throw new AppError('Failed to fetch call transcript', 500);
    }
  }

  async updateAgent(accountId: string, agentId: string, updateData: {
    name?: string;
    voice?: string;
    language?: string;
    prompt?: string;
    webhookUrl?: string;
  }) {
    const client = await this.getApiClient(accountId);
    
    try {
      const response = await client.patch(`/v1/agent/${agentId}`, {
        agent_name: updateData.name,
        voice: updateData.voice,
        language: updateData.language,
        prompt: updateData.prompt,
        webhook_url: updateData.webhookUrl,
      });
      
      return response.data;
    } catch (error) {
      throw new AppError('Failed to update Retell agent', 500);
    }
  }

  async getPhoneNumbers(accountId: string) {
    const client = await this.getApiClient(accountId);
    
    try {
      const response = await client.get('/v1/phone-number');
      return response.data.phone_numbers || [];
    } catch (error) {
      throw new AppError('Failed to fetch phone numbers', 500);
    }
  }

  async updateAgentWebhook(accountId: string, agentId: string, webhookUrl: string) {
    const client = await this.getApiClient(accountId);
    
    try {
      const response = await client.patch(`/update-agent/${agentId}`, {
        webhook_url: webhookUrl,
      });
      return response.data;
    } catch (error) {
      console.error(`Failed to update webhook for agent ${agentId}:`, error);
      throw new AppError('Failed to update Retell agent webhook', 500);
    }
  }


  async getAgentsWithPurposes(accountId: string) {
    try {
      // Fetch agents and phone numbers concurrently
      const [agents, phoneNumbers] = await Promise.all([
        this.getAgents(accountId),
        this.getPhoneNumbers(accountId)
      ]);

      // Analyze agent purposes based on phone number configurations
      const agentsWithPurposes = agents.map((agent: any) => {
        const purposes = {
          inbound: false,
          outbound: false,
          phoneNumbers: [] as string[]
        };

        // Check each phone number configuration
        phoneNumbers.forEach((phone: any) => {
          if (phone.inbound_agent_id === agent.agent_id) {
            purposes.inbound = true;
            purposes.phoneNumbers.push(`${phone.phone_number} (inbound)`);
          }
          if (phone.outbound_agent_id === agent.agent_id) {
            purposes.outbound = true;
            purposes.phoneNumbers.push(`${phone.phone_number} (outbound)`);
          }
        });

        return {
          ...agent,
          purposes,
          // Helper properties for UI
          canHandleInbound: purposes.inbound,
          canHandleOutbound: purposes.outbound,
          canHandleBoth: purposes.inbound && purposes.outbound,
          primaryPurpose: purposes.inbound && purposes.outbound ? 'both' : 
                         purposes.inbound ? 'inbound' : 
                         purposes.outbound ? 'outbound' : 'none'
        };
      });

      return agentsWithPurposes;
    } catch (error) {
      throw new AppError('Failed to analyze agent purposes', 500);
    }
  }

  async createWebhook(accountId: string, webhookData: {
    url: string;
    events: string[];
    description?: string;
  }) {
    const client = await this.getApiClient(accountId);
    
    try {
      const response = await client.post('/v1/webhook', {
        url: webhookData.url,
        events: webhookData.events,
        description: webhookData.description,
      });
      
      return response.data;
    } catch (error) {
      throw new AppError('Failed to create webhook', 500);
    }
  }

  async validateWebhookSignature(payload: string, signature: string, secret: string): Promise<boolean> {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    return signature === `sha256=${expectedSignature}`;
  }

  formatPhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');
    
    // Add + prefix if not present and format for international calling
    if (digits.length === 10) {
      return `+1${digits}`; // Assume US number
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    } else if (digits.startsWith('+')) {
      return phoneNumber;
    } else {
      return `+${digits}`;
    }
  }

  extractCallMetadata(crmData: any, fieldMappings: any[]): Record<string, any> {
    const metadata: Record<string, any> = {};
    
    fieldMappings.forEach(mapping => {
      if (crmData[mapping.crmField] !== undefined) {
        let value = crmData[mapping.crmField];
        
        // Apply transformations
        switch (mapping.transform) {
          case 'uppercase':
            value = value?.toString().toUpperCase();
            break;
          case 'lowercase':
            value = value?.toString().toLowerCase();
            break;
          case 'phone_format':
            value = this.formatPhoneNumber(value?.toString() || '');
            break;
        }
        
        metadata[mapping.retellField] = value;
      }
    });
    
    return metadata;
  }
}

export const retellService = new RetellService();