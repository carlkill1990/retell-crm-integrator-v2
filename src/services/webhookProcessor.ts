import crypto from 'crypto';
import axios from 'axios';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { AppError } from '../middleware/errorHandler';
import { retellService } from './retellService';
import { addSyncJob, WebhookJobData } from './jobQueue';
import { businessLogicEngine } from './businessLogicEngine';
import { fieldMappingService } from './fieldMappingService';
import { pipedriveService } from './pipedriveService';
import { PhoneNormalizer } from '../utils/phoneNormalizer';
import { oauthService } from './oauthService';
import { decrypt } from '../utils/encryption';
import { DealTitleGenerator } from '../utils/dealTitleGenerator';

export class WebhookProcessor {
  async processWebhook(data: WebhookJobData) {
    try {
      // Log webhook event
      const webhookEvent = await prisma.webhookEvent.create({
        data: {
          integrationId: data.integrationId,
          provider: data.provider,
          eventType: data.eventType,
          payload: data.payload,
          signature: data.signature,
        },
      });

      // Find integration by webhook URL
      const integration = await this.findIntegrationByWebhookUrl(data.integrationId);
      
      if (!integration || !integration.isActive) {
        logger.warn(`Webhook received for inactive/missing integration: ${data.integrationId}`);
        return { success: false, reason: 'Integration not found or inactive' };
      }

      // Verify webhook signature
      if (data.signature && !this.verifyWebhookSignature(data.payload, data.signature, integration.webhookSecret)) {
        throw new AppError('Invalid webhook signature', 401);
      }

      // Check trigger filters  
      if (!this.checkTriggerFilters(data.payload, Array.isArray(integration.triggerFilters) ? integration.triggerFilters : [])) {
        logger.info(`Webhook does not match trigger filters for integration ${integration.id}`);
        return { success: true, reason: 'Filters not matched' };
      }

      // Create sync event
      const syncEvent = await prisma.syncEvent.create({
        data: {
          userId: integration.userId,
          integrationId: integration.id,
          eventType: 'webhook_received',
          status: 'pending',
          sourceData: data.payload,
        },
      });

      // Queue sync job for processing
      await addSyncJob({
        syncEventId: syncEvent.id,
        integrationId: integration.id,
        sourceData: data.payload,
      });

      // Mark webhook as processed
      await prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processed: true },
      });

      logger.info(`Webhook processed successfully for integration ${integration.id}`);
      return { success: true, syncEventId: syncEvent.id };

    } catch (error) {
      logger.error('Webhook processing error:', error);
      throw error;
    }
  }

  private async findIntegrationByWebhookUrl(webhookUrl: string) {
    // Extract webhook ID from URL or use direct lookup
    const integration = await prisma.integration.findFirst({
      where: { 
        webhookUrl: { contains: webhookUrl },
        isActive: true 
      },
      include: {
        retellAccount: true,
        crmAccount: true,
      },
    });

    return integration;
  }

  private verifyWebhookSignature(payload: any, signature: string, secret: string): boolean {
    try {
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex');

      // Support multiple signature formats
      const signatures = [
        `sha256=${expectedSignature}`,
        expectedSignature,
        `sha1=${crypto.createHmac('sha1', secret).update(payloadString).digest('hex')}`,
      ];

      return signatures.includes(signature);
    } catch (error) {
      logger.error('Signature verification error:', error);
      return false;
    }
  }

  private checkTriggerFilters(payload: any, filters: any[]): boolean {
    if (!filters || filters.length === 0) {
      return true; // No filters means all webhooks are processed
    }

    return filters.every(filter => {
      const fieldValue = this.getNestedValue(payload, filter.field);
      
      switch (filter.operator) {
        case 'equals':
          return fieldValue === filter.value;
        case 'not_equals':
          return fieldValue !== filter.value;
        case 'contains':
          return String(fieldValue).includes(filter.value);
        case 'not_contains':
          return !String(fieldValue).includes(filter.value);
        case 'greater_than':
          return Number(fieldValue) > Number(filter.value);
        case 'less_than':
          return Number(fieldValue) < Number(filter.value);
        default:
          logger.warn(`Unknown filter operator: ${filter.operator}`);
          return true;
      }
    });
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  async triggerOutboundCall(syncEventId: string) {
    const syncEvent = await prisma.syncEvent.findUnique({
      where: { id: syncEventId },
      include: {
        integration: {
          include: {
            retellAccount: true,
            crmAccount: true,
          },
        },
      },
    });

    if (!syncEvent || !syncEvent.integration) {
      throw new AppError('Sync event or integration not found', 404);
    }

    try {
      // Update sync event status
      await prisma.syncEvent.update({
        where: { id: syncEventId },
        data: { status: 'processing' },
      });

      // Map CRM data to Retell format
      const mappedData = this.mapCrmDataToRetell(
        syncEvent.sourceData,
        Array.isArray(syncEvent.integration.fieldMappings) ? syncEvent.integration.fieldMappings : []
      );

      // Extract phone number
      const phoneNumber = this.extractPhoneNumber(mappedData);
      if (!phoneNumber) {
        throw new AppError('No valid phone number found in mapped data', 400);
      }

      // Prepare call configuration
      const callConfigData = syncEvent.integration.callConfiguration as any;
      const callConfig = {
        agentId: syncEvent.integration.retellAgentId || callConfigData?.agentId,
        toNumber: phoneNumber,
        fromNumber: callConfigData?.phoneNumber,
        metadata: mappedData,
        webhookUrl: `${process.env.API_BASE_URL}/api/webhooks/retell/${syncEvent.integration.id}`,
      };

      // Create call via Retell API
      const callResult = await retellService.createCall(
        syncEvent.integration.retellAccountId,
        callConfig
      );

      // Update sync event with call details
      await prisma.syncEvent.update({
        where: { id: syncEventId },
        data: {
          status: 'completed',
          mappedData,
          retellCallId: callResult.call_id,
          processedAt: new Date(),
          eventType: 'call_triggered',
        },
      });

      logger.info(`Outbound call triggered successfully: ${callResult.call_id}`);
      return { success: true, callId: callResult.call_id };

    } catch (error) {
      // Update sync event with error
      await prisma.syncEvent.update({
        where: { id: syncEventId },
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          retryCount: { increment: 1 },
        },
      });

      logger.error(`Failed to trigger outbound call for sync event ${syncEventId}:`, error);
      throw error;
    }
  }

  private mapCrmDataToRetell(sourceData: any, fieldMappings: any[]): Record<string, any> {
    const mappedData: Record<string, any> = {};

    if (!fieldMappings || fieldMappings.length === 0) {
      return sourceData; // Return original data if no mappings
    }

    fieldMappings.forEach(mapping => {
      const sourceValue = this.getNestedValue(sourceData, mapping.crmField);
      
      if (sourceValue !== undefined) {
        let transformedValue = sourceValue;

        // Apply transformations
        switch (mapping.transform) {
          case 'uppercase':
            transformedValue = String(sourceValue).toUpperCase();
            break;
          case 'lowercase':
            transformedValue = String(sourceValue).toLowerCase();
            break;
          case 'phone_format':
            transformedValue = retellService.formatPhoneNumber(String(sourceValue));
            break;
        }

        mappedData[mapping.retellField] = transformedValue;
      } else if (mapping.required) {
        logger.warn(`Required field ${mapping.crmField} not found in source data`);
      }
    });

    return mappedData;
  }

  private extractPhoneNumber(mappedData: Record<string, any>): string | null {
    // Try common phone field names
    const phoneFields = ['customer_phone', 'phone', 'phoneNumber', 'mobile', 'telephone'];
    
    for (const field of phoneFields) {
      if (mappedData[field]) {
        const formatted = retellService.formatPhoneNumber(String(mappedData[field]));
        if (this.isValidPhoneNumber(formatted)) {
          return formatted;
        }
      }
    }

    return null;
  }

  private isValidPhoneNumber(phone: string): boolean {
    // Basic phone number validation
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phone);
  }

  /**
   * Execute field mappings for Retell webhook data
   */
  private async executeFieldMappings(integrationId: string, retellPayload: any): Promise<void> {
    try {
      console.log(`🔄 Starting field mapping execution for integration: ${integrationId}`);
      
      // Get integration with CRM account info
      const integration = await prisma.integration.findUnique({
        where: { id: integrationId },
        include: {
          crmAccount: {
            select: {
              id: true,
              provider: true,
              crmSchema: true
            }
          }
        }
      });

      if (!integration || !integration.crmAccount) {
        console.warn(`No CRM account found for integration: ${integrationId}`);
        return;
      }

      // Check if there are any field mappings configured
      const fieldMappings = integration.fieldMappings as any[] || [];
      if (fieldMappings.length === 0) {
        console.log(`No field mappings configured for integration: ${integrationId}`);
        return;
      }

      console.log(`🎯 Found ${fieldMappings.length} field mappings to process`);

      // Transform Retell data to Pipedrive format
      const transformedData = await fieldMappingService.transformWebhookData(
        retellPayload,
        integrationId
      );

      console.log(`✅ Data transformation completed:`, JSON.stringify(transformedData, null, 2));

      // Send to Pipedrive if CRM is Pipedrive
      if (integration.crmAccount.provider === 'pipedrive') {
        await this.processPipedriveData(transformedData, integration.crmAccount.id, retellPayload.call_id);
      } else {
        console.warn(`CRM provider ${integration.crmAccount.provider} not supported for field mapping yet`);
      }

      console.log(`✅ Field mapping execution completed for integration: ${integrationId}`);

    } catch (error) {
      console.error(`❌ Field mapping execution failed for integration ${integrationId}:`, error);
      throw error;
    }
  }

  /**
   * Process Pipedrive data using the enhanced service
   */
  private async processPipedriveData(
    transformedData: any,
    crmAccountId: string,
    retellCallId: string
  ): Promise<void> {
    try {
      console.log(`📤 Sending data to Pipedrive for account: ${crmAccountId}`);
      
      // Get access token
      const accessToken = await oauthService.getDecryptedAccessToken(crmAccountId);
      
      let personId: number | undefined;
      let dealId: number | undefined;
      let activityId: number | undefined;

      // 1. Handle Person data
      if (transformedData.person) {
        try {
          const personResult = await pipedriveService.createPerson(accessToken, transformedData.person);
          personId = personResult.id;
          console.log(`✅ Person created/updated: ${personId}`);
        } catch (error) {
          console.error(`❌ Person processing failed:`, error);
        }
      }

      // 2. Handle Deal data (link to person if available)
      if (transformedData.deal) {
        try {
          if (personId) {
            transformedData.deal.person_id = personId;
          }
          
          const dealResult = await pipedriveService.createDeal(accessToken, transformedData.deal);
          dealId = dealResult.id;
          console.log(`✅ Deal created: ${dealId}`);
        } catch (error) {
          console.error(`❌ Deal processing failed:`, error);
        }
      }

      // 3. Handle Activity data (link to person and/or deal)
      if (transformedData.activity) {
        try {
          if (personId) {
            transformedData.activity.person_id = personId;
          }
          if (dealId) {
            transformedData.activity.deal_id = dealId;
          }
          
          // Add Retell call reference
          if (transformedData.activity.note) {
            transformedData.activity.note += `\n\n[Retell Call ID: ${retellCallId}]`;
          } else {
            transformedData.activity.note = `Call processed via Retell AI\n[Call ID: ${retellCallId}]`;
          }

          const activityResult = await pipedriveService.createActivity(accessToken, transformedData.activity);
          activityId = activityResult.id;
          console.log(`✅ Activity created: ${activityId}`);
        } catch (error) {
          console.error(`❌ Activity processing failed:`, error);
        }
      }

      console.log(`🎉 Pipedrive processing completed - Person: ${personId}, Deal: ${dealId}, Activity: ${activityId}`);

    } catch (error) {
      console.error('❌ Pipedrive processing failed:', error);
      throw error;
    }
  }

  async handleRetellWebhook(integrationId: string, payload: any) {
    try {
      // Multi-tenant processing - always use user-specific integrations

      const integration = await prisma.integration.findUnique({
        where: { id: integrationId },
        include: {
          crmAccount: {
            select: { 
              id: true,
              provider: true, 
              accessToken: true, 
              accountName: true 
            }
          }
        }
      });

      if (!integration) {
        throw new AppError('Integration not found', 404);
      }

      // Log Retell webhook event
      await prisma.webhookEvent.create({
        data: {
          integrationId,
          provider: 'retell',
          eventType: payload.event || payload.event_type || 'unknown',
          payload,
          processed: true,
        },
      });

      // Process call_ended events with transcript (real call completion)
      if (payload.call_status === 'ended' && payload.transcript) {
        try {
          await this.processRetellCallData(integration, payload);
        } catch (error) {
          logger.error(`Retell call processing failed for integration ${integrationId}:`, error);
        }
      }

      // Execute business logic workflows for call_analyzed events
      if (payload.event === 'call_analyzed' || payload.event_type === 'call_analyzed') {
        try {
          // Process Retell call data first (creates Pipedrive activities)
          // Debug OAuth token decryption
          console.log(`🔍 DEBUG: CRM Account ID: ${integration.crmAccount.id}`);
          console.log(`🔍 DEBUG: CRM Account Provider: ${integration.crmAccount.provider}`);
          
          try {
            const accessToken = await oauthService.getDecryptedAccessToken(integration.crmAccount.id);
            console.log(`🔍 DEBUG: Decrypted token length: ${accessToken?.length || 'null'}`);
            console.log(`🔍 DEBUG: Decrypted token preview: ${accessToken?.substring(0, 10) || 'null'}...`);
            
            const integrationWithAccounts = {
              ...integration,
              accounts: [{
                provider: integration.crmAccount.provider,
                accessToken: accessToken
              }]
            };
            await this.processRetellCallData(integrationWithAccounts, payload);
          } catch (error) {
            console.error(`❌ DEBUG: OAuth decryption failed:`, error);
            // Fallback to env token for debugging
            console.log(`🔄 DEBUG: Using fallback env token`);
            const integrationWithAccounts = {
              ...integration,
              accounts: [{
                provider: integration.crmAccount.provider,
                accessToken: process.env.PIPEDRIVE_ACCESS_TOKEN
              }]
            };
            await this.processRetellCallData(integrationWithAccounts, payload);
          }
          
          // Execute business logic workflows (templates-based)
          const businessLogicResult = await businessLogicEngine.executeWorkflows(integrationId, payload);
          logger.info(`Business logic executed for integration ${integrationId}:`, businessLogicResult);
          
          // Execute field mapping transformations
          await this.executeFieldMappings(integrationId, payload);
          
        } catch (error) {
          logger.error(`Business logic execution failed for integration ${integrationId}:`, error);
          // Don't throw here - we still want to log the webhook event
        }
      }

      // Update sync event if call ID is present
      if (payload.call_id) {
        const syncEvent = await prisma.syncEvent.findFirst({
          where: {
            integrationId,
            retellCallId: payload.call_id,
          },
        });

        if (syncEvent) {
          await prisma.syncEvent.update({
            where: { id: syncEvent.id },
            data: {
              status: payload.event_type === 'call_ended' ? 'completed' : 'processing',
              processedAt: payload.event_type === 'call_ended' ? new Date() : syncEvent.processedAt,
            },
          });
        }
      }

      logger.info(`Retell webhook processed for integration ${integrationId}`);
      return { success: true };

    } catch (error) {
      logger.error('Retell webhook processing error:', error);
      throw error;
    }
  }

  private async processRetellCallData(integration: any, payload: any) {
    logger.info(`🔄 Processing Retell call data for integration ${integration.id}`);
    
    // Find Pipedrive account
    const pipedriveAccount = integration.accounts?.find((acc: any) => acc.provider === 'pipedrive');
    if (!pipedriveAccount) {
      logger.warn('No Pipedrive account found for integration');
      return;
    }

    // Handle nested payload structure - data is under payload.call
    const callData = payload.call || payload;
    
    // Extract contact info based on call direction
    // For inbound calls: use from_number (caller's phone) 
    // For outbound calls: use to_number (person being called)
    // Since direction is not provided, infer from phone numbers
    const isInbound = !callData.direction || callData.direction === 'inbound';
    const contactPhone = isInbound ? callData.from_number : callData.to_number;
    
    // Use smart name extraction from DealTitleGenerator for better contact names
    const titleComponents = DealTitleGenerator.extractComponents(callData);
    const extractedName = titleComponents.name;
    
    const contactData = {
      name: extractedName || callData.retell_llm_dynamic_variables?.name || (isInbound ? 'Inbound Caller' : 'Outbound Contact'),
      phone: callData.retell_llm_dynamic_variables?.phone || contactPhone,
      email: callData.retell_llm_dynamic_variables?.email,
      direction: callData.direction
    };

    logger.info(`📞 Processing call for contact:`, contactData);

    try {
      // Step 1: Try to find existing contact by phone
      let personId = await this.findContactByPhone(contactData.phone, pipedriveAccount.accessToken);
      
      // Step 2: If no phone match, try email
      if (!personId && contactData.email) {
        personId = await this.findContactByEmail(contactData.email, pipedriveAccount.accessToken);
      }
      
      // Step 3: Create new contact if no match found
      if (!personId) {
        personId = await this.createNewContact(contactData, pipedriveAccount.accessToken);
      } else {
        logger.info(`✅ Found existing contact, person_id: ${personId}`);
      }

      // Step 4: Create call activity
      const callDateTime = new Date(callData.start_timestamp);
      const callDate = callDateTime.toLocaleString('en-GB', {
        timeZone: 'Europe/London',
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const durationSeconds = Math.round(callData.duration_ms / 1000);
      
      // Handle voicemail vs regular calls
      let note;
      if (callData.call_analysis?.in_voicemail === true) {
        // Voicemail call - different formatting
        // Get agent name for notes
        const agentName = callData.agent_name || callData.agent_id || 'Unknown Agent';
        
        note = `📞 <strong>CALL DETAILS:</strong><br>
Agent: <strong>${agentName}</strong><br>
Duration: ${Math.floor(durationSeconds / 60)} minute${Math.floor(durationSeconds / 60) !== 1 ? 's' : ''} ${durationSeconds % 60 ? `${durationSeconds % 60} seconds` : ''}<br>
Status: <strong>📞 Call not answered</strong><br>
Recording: <a href="${callData.recording_url}" target="_blank">Download Recording</a><br><br>
📝 <strong>CALL DETAILS:</strong><br><br>
${callData.transcript || 'Call went unanswered - see recording for details'}`;
      } else {
        // Regular answered call - existing transcript formatting
        const transcript = callData.transcript || 'No transcript available';
        const formattedTranscript = transcript
          .split('\n')
          .map((line: string) => {
            if (line.startsWith('Agent:')) {
              return `🎧 <strong>Agent:</strong> ${line.replace('Agent:', '').trim()}`;
            } else if (line.startsWith('User:')) {
              return `👤 <strong>User:</strong> ${line.replace('User:', '').trim()}`;
            }
            return line.trim() ? line : ''; // Keep non-empty lines as is
          })
          .filter(line => line !== '') // Remove empty lines
          .join('<br><br>'); // Double line breaks for spacing

        // Get agent name for notes
        const agentName = callData.agent_name || callData.agent_id || 'Unknown Agent';
        
        note = `📞 <strong>CALL DETAILS:</strong><br>
Agent: <strong>${agentName}</strong><br>
Duration: ${Math.floor(durationSeconds / 60)} minute${Math.floor(durationSeconds / 60) !== 1 ? 's' : ''} ${durationSeconds % 60 ? `${durationSeconds % 60} seconds` : ''}<br>
Recording: <a href="${callData.recording_url}" target="_blank">Download Recording</a><br><br>
📝 <strong>TRANSCRIPT:</strong><br><br>
${formattedTranscript}`;
      }

      const dueDate = callDateTime.toISOString().split('T')[0];
      const dueTime = callDateTime.toISOString().split('T')[1].substring(0, 5);

      // Set activity subject based on call outcome (no agent name in title)
      const callDirection = isInbound ? 'Inbound' : 'Outbound';
      const subject = callData.call_analysis?.in_voicemail === true 
        ? `${callDirection} Call: Unanswered`
        : `${callDirection} Call: Answered`;

      const activityId = await this.createCallActivity({
        person_id: personId,
        note: note,
        subject: subject,
        type: 'call',
        due_date: dueDate,
        due_time: dueTime
      }, pipedriveAccount.accessToken);

      // Step 5: Create deal only if call was successful
      let dealId = null;
      if (callData.call_analysis?.call_successful === true) {
        // Generate smart deal title from call data
        const dealTitle = DealTitleGenerator.generateDealTitle(callData);
        
        dealId = await this.createDeal({
          person_id: personId,
          title: dealTitle,
          value: 5000 // Default value
        }, pipedriveAccount.accessToken, integration);
        logger.info(`💰 Created deal: ${dealId}`);
        
        // Step 6: Add call summary note to the deal
        if (dealId && callData.call_analysis?.call_summary) {
          await this.addDealNote(dealId, {
            call_summary: callData.call_analysis.call_summary,
            next_steps: callData.call_analysis.next_steps,
            caller_name: extractedName,
            caller_phone: contactPhone,
            call_date: callDateTime.toLocaleString('en-GB', { timeZone: 'Europe/London' })
          }, pipedriveAccount.accessToken);
        }
      } else {
        logger.info('🚫 Skipping deal creation (call was not successful)');
      }

      logger.info(`🎉 Successfully processed Retell call - Contact: ${personId}, Activity: ${activityId}, Deal: ${dealId}`);
      
    } catch (error) {
      logger.error('Failed to process Retell call data:', error);
      throw error;
    }
  }

  private async findContactByPhone(phone: string, accessToken: string): Promise<number | null> {
    if (!phone) {
      logger.info('📞 No phone number provided for search');
      return null;
    }
    
    // Generate all possible phone number variations
    const variations = PhoneNormalizer.generateVariations(phone);
    logger.info(`📞 Searching with ${variations.length} phone variations: ${variations.map(v => v.format).join(', ')}`);
    
    // Try each variation until we find a match
    for (const variation of variations) {
      try {
        logger.info(`📞 Trying phone format: ${variation.format} (${variation.description})`);
        
        const response = await axios.get('https://api.pipedrive.com/v1/persons/search', {
          params: {
            term: variation.format,
            fields: 'phone'
          },
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (response.data?.success && response.data?.data?.items?.length > 0) {
          const personId = response.data.data.items[0].item.id;
          const name = response.data.data.items[0].item.name;
          logger.info(`📞 ✅ Found existing contact by phone: ${personId} (${name}) using format: ${variation.format}`);
          return personId;
        }
      } catch (error) {
        logger.warn(`📞 Phone search failed for variation ${variation.format}:`, error instanceof Error ? error.message : 'Unknown error');
        continue; // Try next variation
      }
    }
    
    logger.info('📞 No contact found with any phone variation');
    return null;
  }

  private async findContactByEmail(email: string, accessToken: string): Promise<number | null> {
    try {
      const response = await axios.get('https://api.pipedrive.com/v1/persons/search', {
        params: {
          term: email,
          fields: 'email'
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.data?.success && response.data?.data?.items?.length > 0) {
        const personId = response.data.data.items[0].item.id;
        const name = response.data.data.items[0].item.name;
        logger.info(`📧 Found existing contact by email: ${personId} (${name})`);
        return personId;
      }
      return null;
    } catch (error) {
      logger.error('Email search failed:', error);
      return null;
    }
  }

  private async createNewContact(contactData: any, accessToken: string): Promise<number> {
    const response = await axios.post('https://api.pipedrive.com/v1/persons', {
      name: contactData.name,
      phone: contactData.phone,
      email: contactData.email
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const personId = response.data.data.id;
    logger.info(`🆕 Created new contact: ${personId}`);
    return personId;
  }

  private async createCallActivity(activityData: any, accessToken: string): Promise<number> {
    const response = await axios.post('https://api.pipedrive.com/v1/activities', {
      person_id: activityData.person_id,
      subject: activityData.subject,
      note: activityData.note,
      type: activityData.type,
      due_date: activityData.due_date,
      due_time: activityData.due_time,
      done: true
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const activityId = response.data.data.id;
    logger.info(`📝 Created activity: ${activityId}`, {
      person_id: activityData.person_id,
      subject: activityData.subject,
      type: activityData.type,
      due_date: activityData.due_date,
      due_time: activityData.due_time,
      pipedrive_response: response.data
    });
    return activityId;
  }

  private async createDeal(dealData: any, accessToken: string, integration?: any): Promise<number> {
    const dealPayload: any = {
      person_id: dealData.person_id,
      title: dealData.title,
      value: dealData.value,
      currency: 'GBP',
      status: 'open'
    };

    // Add pipeline and stage from integration configuration if available
    if (integration?.callConfiguration) {
      try {
        const config = integration.callConfiguration;
        
        if (config.selectedPipelineId) {
          dealPayload.pipeline_id = parseInt(config.selectedPipelineId);
          logger.info(`💼 Using configured pipeline: ${config.selectedPipelineId}`);
        }
        
        if (config.selectedStageId) {
          dealPayload.stage_id = parseInt(config.selectedStageId);
          logger.info(`📍 Using configured stage: ${config.selectedStageId}`);
        }
      } catch (error) {
        logger.warn('Failed to parse integration config for pipeline/stage selection:', error);
      }
    }

    logger.info(`💰 Creating deal with payload:`, dealPayload);

    const response = await axios.post('https://api.pipedrive.com/v1/deals', dealPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const dealId = response.data.data.id;
    logger.info(`✅ Deal created successfully: ${dealId}`);
    return dealId;
  }

  private async addDealNote(dealId: number, callInfo: any, accessToken: string): Promise<void> {
    try {
      // Format next steps as HTML list
      const nextStepsHtml = callInfo.next_steps && callInfo.next_steps.length > 0
        ? `<ul>${callInfo.next_steps.map((step: string) => `<li>${step}</li>`).join('')}</ul>`
        : '<p><em>No specific next steps recorded</em></p>';

      const noteContent = `
        <h4>📞 Call Summary</h4>
        <p><strong>Date:</strong> ${callInfo.call_date}</p>
        <p><strong>Caller:</strong> ${callInfo.caller_name || 'Unknown'}</p>
        <p><strong>Phone:</strong> ${callInfo.caller_phone || 'Unknown'}</p>
        <hr>
        <h4>📝 Summary</h4>
        <p>${callInfo.call_summary}</p>
        
        <h4>📋 Next Steps</h4>
        ${nextStepsHtml}
      `.trim();

      const notePayload = {
        content: noteContent,
        deal_id: dealId
      };

      logger.info(`📝 Adding note to deal ${dealId}`);

      const response = await axios.post('https://api.pipedrive.com/v1/notes', notePayload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const noteId = response.data.data.id;
      logger.info(`✅ Note added to deal successfully: ${noteId}`);

    } catch (error) {
      logger.error(`❌ Failed to add note to deal ${dealId}:`, error);
      // Don't throw - note creation failure shouldn't break the entire process
    }
  }

  private async getAgentName(agentId: string, accessToken: string): Promise<string> {
    try {
      const response = await axios.get(`https://api.retellai.com/get-agent/${agentId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data.agent_name || agentId;
    } catch (error) {
      logger.warn(`Failed to fetch agent name for ${agentId}:`, error);
      return agentId; // Fallback to agent ID
    }
  }
}

export const webhookProcessor = new WebhookProcessor();