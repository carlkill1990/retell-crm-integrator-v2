import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { pipedriveService } from './pipedriveService';
import { hubspotService } from './hubspotService';
import { salesforceService } from './salesforceService';
import { zohoService } from './zohoService';

interface BusinessWorkflow {
  id: string;
  name: string;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  enabled: boolean;
}

interface WorkflowTrigger {
  event: string; // 'call_analyzed'
}

interface WorkflowCondition {
  field: string;
  operator: string;
  value: any;
  logicalOperator?: 'AND' | 'OR';
}

interface WorkflowAction {
  type: string; // 'create_deal', 'update_person', 'create_activity'
  crmObject: string; // 'person', 'deal', 'activity'
  fields: { [key: string]: string | number | boolean };
}

export class BusinessLogicEngine {
  // Pre-built workflow templates
  getConsultationBookingTemplate(): BusinessWorkflow {
    return {
      id: 'consultation_booking',
      name: 'Consultation Booking',
      trigger: { event: 'call_analyzed' },
      conditions: [
        {
          field: 'any_field',
          operator: 'indicates_booking',
          value: true
        }
      ],
      actions: [
        {
          type: 'create_person',
          crmObject: 'person',
          fields: {
            name: '{{call.call_analysis.custom_analysis_data.customer_name}}',
            phone: '{{call.call_analysis.custom_analysis_data.customer_phone}}',
            email: '{{call.call_analysis.custom_analysis_data.customer_email}}'
          }
        },
        {
          type: 'create_deal',
          crmObject: 'deal',
          fields: {
            title: 'Consultation Call',
            person_id: '{{previous_action_result.id}}',
            value: '{{call.call_analysis.custom_analysis_data.deal_value}}',
            status: 'open'
          }
        },
        {
          type: 'create_activity',
          crmObject: 'activity',
          fields: {
            subject: 'Consultation Call',
            type: 'call',
            deal_id: '{{previous_action_result.id}}',
            person_id: '{{action_0_result.id}}',
            note: '{{call.call_analysis.call_summary}}',
            done: true
          }
        },
        {
          type: 'update_deal',
          crmObject: 'deal',
          fields: {
            deal_id: '{{action_1_result.id}}',
            stage_id: '{{crm_config.meeting_scheduled_stage_id}}'
          }
        }
      ],
      enabled: true
    };
  }

  async applyConsultationBookingTemplate(integrationId: string): Promise<void> {
    const template = this.getConsultationBookingTemplate();
    
    await prisma.integration.update({
      where: { id: integrationId },
      data: {
        businessWorkflows: [template] as any
      }
    });
    
    logger.info(`Applied consultation booking template to integration ${integrationId}`);
  }

  // Smart field detection system
  analyzeWebhookFields(webhook: any): Array<{id: string, name: string, value: any, suggestedMapping: string}> {
    const discoveredFields: any[] = [];
    const callAnalysis = webhook.call?.call_analysis || {};
    
    // Extract custom analysis data
    const customData = callAnalysis.custom_analysis_data || {};
    for (const [key, value] of Object.entries(customData)) {
      discoveredFields.push({
        id: `custom_analysis_data.${key}`,
        name: key,
        value,
        suggestedMapping: this.suggestCrmMapping(key, value)
      });
    }

    // Extract metadata
    const metadata = webhook.call?.metadata || {};
    for (const [key, value] of Object.entries(metadata)) {
      discoveredFields.push({
        id: `metadata.${key}`,
        name: key,
        value,
        suggestedMapping: this.suggestCrmMapping(key, value)
      });
    }

    // Extract dynamic variables
    const dynamicVars = callAnalysis.retell_llm_dynamic_variables || {};
    for (const [key, value] of Object.entries(dynamicVars)) {
      discoveredFields.push({
        id: `retell_llm_dynamic_variables.${key}`,
        name: key,
        value,
        suggestedMapping: this.suggestCrmMapping(key, value)
      });
    }

    // Standard call fields
    if (callAnalysis.call_summary) {
      discoveredFields.push({
        id: 'call_analysis.call_summary',
        name: 'call_summary',
        value: callAnalysis.call_summary,
        suggestedMapping: 'activity.note'
      });
    }

    return discoveredFields;
  }

  private suggestCrmMapping(fieldName: string, fieldValue: any): string {
    const name = fieldName.toLowerCase();
    const value = String(fieldValue).toLowerCase();

    // Customer contact info mappings
    if (name.includes('name') || name.includes('customer')) return 'person.name';
    if (name.includes('phone') || name.includes('mobile')) return 'person.phone';
    if (name.includes('email')) return 'person.email';
    
    // Deal mappings
    if (name.includes('value') || name.includes('price') || name.includes('amount')) return 'deal.value';
    if (name.includes('deal') || name.includes('opportunity')) return 'deal.title';
    
    // Activity mappings
    if (name.includes('summary') || name.includes('transcript')) return 'activity.note';
    if (name.includes('meeting') || name.includes('appointment')) return 'activity.subject';
    
    // Success indicators
    if (name.includes('booked') || name.includes('scheduled') || name.includes('confirmed')) {
      if (value.includes('yes') || value.includes('true') || value.includes('success')) {
        return 'workflow_trigger';
      }
    }

    return 'custom_field';
  }

  async executeWorkflows(integrationId: string, retellWebhook: any) {
    try {
      logger.info(`Executing business logic for integration ${integrationId}`);

      // Get integration with workflows
      const integration = await prisma.integration.findUnique({
        where: { id: integrationId },
        include: {
          crmAccount: true,
          retellAccount: true,
        },
      });

      if (!integration || !integration.isActive) {
        logger.warn(`Integration ${integrationId} not found or inactive`);
        return { success: false, reason: 'Integration not active' };
      }

      // Get business workflows from integration config
      const workflows = this.parseBusinessWorkflows(integration.businessWorkflows);
      
      if (!workflows || workflows.length === 0) {
        logger.info(`No business workflows configured for integration ${integrationId}`);
        return { success: true, reason: 'No workflows configured' };
      }

      // Execute applicable workflows
      const results = [];
      for (const workflow of workflows) {
        if (!workflow.enabled) continue;

        if (this.shouldTriggerWorkflow(workflow, retellWebhook)) {
          logger.info(`Executing workflow: ${workflow.name}`);
          const result = await this.executeWorkflow(workflow, integration, retellWebhook);
          results.push({ workflow: workflow.name, ...result });
        }
      }

      return { success: true, results };

    } catch (error) {
      logger.error('Business logic execution error:', error);
      throw error;
    }
  }

  private parseBusinessWorkflows(workflowsData: any): BusinessWorkflow[] {
    if (!workflowsData || typeof workflowsData !== 'object') {
      return [];
    }

    // Handle both array and object formats
    const workflows = Array.isArray(workflowsData) ? workflowsData : [workflowsData];
    return workflows.filter(w => w && w.enabled);
  }

  private shouldTriggerWorkflow(workflow: BusinessWorkflow, webhook: any): boolean {
    // Check trigger event
    if (workflow.trigger.event !== 'call_analyzed' || webhook.event !== 'call_analyzed') {
      return false;
    }

    // Check conditions
    if (!workflow.conditions || workflow.conditions.length === 0) {
      return true; // No conditions means always trigger
    }

    return this.evaluateConditions(workflow.conditions, webhook);
  }

  private evaluateConditions(conditions: WorkflowCondition[], webhook: any): boolean {
    if (conditions.length === 0) return true;

    // For now, implement simple AND logic
    return conditions.every(condition => {
      const fieldValue = this.getNestedValue(webhook, condition.field);
      return this.evaluateCondition(fieldValue, condition.operator, condition.value, webhook);
    });
  }

  private evaluateCondition(fieldValue: any, operator: string, expectedValue: any, webhook?: any): boolean {
    switch (operator) {
      case 'equals':
        return fieldValue === expectedValue;
      case 'not_equals':
        return fieldValue !== expectedValue;
      case 'contains':
        return String(fieldValue).toLowerCase().includes(String(expectedValue).toLowerCase());
      case 'not_contains':
        return !String(fieldValue).toLowerCase().includes(String(expectedValue).toLowerCase());
      case 'exists':
        return fieldValue !== undefined && fieldValue !== null;
      case 'not_exists':
        return fieldValue === undefined || fieldValue === null;
      case 'greater_than':
        return Number(fieldValue) > Number(expectedValue);
      case 'less_than':
        return Number(fieldValue) < Number(expectedValue);
      // Smart detection operators
      case 'indicates_success':
        return this.detectSuccess(fieldValue, webhook);
      case 'indicates_booking':
        return this.detectBooking(fieldValue, webhook);
      case 'indicates_failure':
        return this.detectFailure(fieldValue, webhook);
      default:
        logger.warn(`Unknown condition operator: ${operator}`);
        return false;
    }
  }

  // Smart detection methods for goal-based workflows
  private detectSuccess(fieldValue: any, webhook: any): boolean {
    const callAnalysis = webhook.call?.call_analysis;
    if (!callAnalysis) return false;

    // Use standard call_successful field if available
    if (callAnalysis.call_successful === true) return true;

    // Look for success indicators in custom analysis data
    const customData = callAnalysis.custom_analysis_data || {};
    const successIndicators = [
      'booked', 'scheduled', 'confirmed', 'agreed', 'yes', 'success',
      'completed', 'qualified', 'interested', 'positive'
    ];

    // Check all custom fields for success indicators
    for (const [key, value] of Object.entries(customData)) {
      const valueStr = String(value).toLowerCase();
      if (successIndicators.some(indicator => valueStr.includes(indicator))) {
        return true;
      }
    }

    return false;
  }

  private detectBooking(fieldValue: any, webhook: any): boolean {
    const callAnalysis = webhook.call?.call_analysis;
    if (!callAnalysis) return false;

    const customData = callAnalysis.custom_analysis_data || {};
    const bookingIndicators = [
      'booked', 'scheduled', 'appointment', 'meeting', 'consultation',
      'calendar', 'date', 'time'
    ];

    // Check for booking-specific indicators
    for (const [key, value] of Object.entries(customData)) {
      const keyStr = key.toLowerCase();
      const valueStr = String(value).toLowerCase();
      
      if (bookingIndicators.some(indicator => 
        keyStr.includes(indicator) || valueStr.includes(indicator)
      )) {
        return true;
      }
    }

    return false;
  }

  private detectFailure(fieldValue: any, webhook: any): boolean {
    const callAnalysis = webhook.call?.call_analysis;
    if (!callAnalysis) return true; // No analysis = failure

    // Use standard fields
    if (callAnalysis.call_successful === false) return true;
    if (callAnalysis.in_voicemail === true) return true;

    // Check call duration (less than 30 seconds = likely failure)
    if (webhook.call?.duration_ms && webhook.call.duration_ms < 30000) {
      return true;
    }

    return false;
  }

  private async executeWorkflow(workflow: BusinessWorkflow, integration: any, webhook: any) {
    const results = [];
    const actionResults = {}; // Store results for template replacement

    for (let i = 0; i < workflow.actions.length; i++) {
      const action = workflow.actions[i];
      try {
        // Process templates with previous action results
        const contextData = {
          ...webhook,
          previous_action_result: results[i - 1]?.data || {},
          action_0_result: results[0]?.data || {},
          action_1_result: results[1]?.data || {},
          action_2_result: results[2]?.data || {},
        };

        const actionResult = await this.executeAction(action, integration, contextData);
        results.push({ action: action.type, ...actionResult });
        actionResults[`action_${i}_result`] = actionResult.data || {};
      } catch (error) {
        logger.error(`Failed to execute action ${action.type}:`, error);
        results.push({ action: action.type, success: false, error: (error as any).message });
        break; // Stop execution on failure
      }
    }

    return { success: true, actions: results };
  }

  private async executeAction(action: WorkflowAction, integration: any, webhook: any) {
    const crmService = this.getCrmService(integration.crmAccount.provider);
    const accessToken = integration.crmAccount.accessToken;

    // Replace template variables in field values
    const processedFields = this.processFieldTemplates(action.fields, webhook);

    switch (action.type) {
      case 'create_person':
        return await this.createPersonAction(crmService, accessToken, processedFields);
      
      case 'create_deal':
        return await this.createDealAction(crmService, accessToken, processedFields, integration);
      
      case 'update_person':
        return await this.updatePersonAction(crmService, accessToken, processedFields);
      
      case 'create_activity':
        return await this.createActivityAction(crmService, accessToken, processedFields);
      
      case 'update_deal':
        return await this.updateDealAction(crmService, accessToken, processedFields);
      
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  private getCrmService(provider: string) {
    switch (provider) {
      case 'pipedrive':
        return pipedriveService;
      case 'hubspot':
        return hubspotService;
      case 'salesforce':
        return salesforceService;
      case 'zoho':
        return zohoService;
      default:
        throw new Error(`Unsupported CRM provider: ${provider}`);
    }
  }

  private processFieldTemplates(fields: any, webhook: any): any {
    const processed = {};
    
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value === 'string' && value.includes('{{')) {
        // Replace template variables like {{retell_llm_dynamic_variables.name}}
        processed[key] = this.replaceTemplateVariables(value as string, webhook);
      } else {
        processed[key] = value;
      }
    }
    
    return processed;
  }

  private replaceTemplateVariables(template: string, webhook: any): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = this.getNestedValue(webhook.call || webhook, path.trim());
      return value !== undefined ? String(value) : match;
    });
  }

  private async createPersonAction(crmService: any, accessToken: string, fields: any) {
    const personData = {
      name: fields.name,
      phone: fields.phone ? [{ value: fields.phone, primary: true }] : undefined,
      email: fields.email ? [{ value: fields.email, primary: true }] : undefined,
    };

    // Remove undefined fields
    Object.keys(personData).forEach(key => {
      if (personData[key] === undefined) delete personData[key];
    });

    const result = await crmService.createPerson(accessToken, personData);
    logger.info(`Created person: ${result.id}`);
    
    return { success: true, id: result.id, data: result };
  }

  private async createDealAction(crmService: any, accessToken: string, fields: any, integration?: any) {
    const dealData: any = {
      title: fields.title || 'Call Follow-up Deal',
      person_id: fields.person_id,
      value: fields.value,
      currency: fields.currency || 'USD',
      status: fields.status || 'open',
    };

    // Add pipeline and stage from integration configuration if available
    if (integration?.config) {
      try {
        const config = typeof integration.config === 'string' 
          ? JSON.parse(integration.config) 
          : integration.config;
        
        if (config.selectedPipelineId) {
          dealData.pipeline_id = parseInt(config.selectedPipelineId);
          logger.info(`Using configured pipeline: ${config.selectedPipelineId}`);
        }
        
        if (config.selectedStageId) {
          dealData.stage_id = parseInt(config.selectedStageId);
          logger.info(`Using configured stage: ${config.selectedStageId}`);
        }
      } catch (error) {
        logger.warn('Failed to parse integration config for pipeline/stage selection:', error);
      }
    }

    // Remove undefined fields
    Object.keys(dealData).forEach(key => {
      if (dealData[key] === undefined) delete dealData[key];
    });

    const result = await crmService.createDeal(accessToken, dealData);
    logger.info(`Created deal: ${result.id}`);
    
    return { success: true, id: result.id, data: result };
  }

  private async updatePersonAction(crmService: any, accessToken: string, fields: any) {
    const personId = fields.person_id;
    
    if (!personId) {
      throw new Error('Person ID not provided');
    }

    const personData = {
      name: fields.name,
      phone: fields.phone,
      email: fields.email,
    };

    // Remove undefined fields
    Object.keys(personData).forEach(key => {
      if (personData[key] === undefined) delete personData[key];
    });

    const result = await crmService.updatePerson(accessToken, personId, personData);
    logger.info(`Updated person: ${personId}`);
    
    return { success: true, id: personId, data: result };
  }

  private async createActivityAction(crmService: any, accessToken: string, fields: any) {
    const activityData = {
      subject: fields.subject || 'Call Activity',
      type: fields.type || 'call',
      note: fields.note,
      person_id: fields.person_id,
      deal_id: fields.deal_id,
      due_date: fields.due_date,
      due_time: fields.due_time,
      done: fields.done !== undefined ? fields.done : true,
    };

    // Remove undefined fields
    Object.keys(activityData).forEach(key => {
      if (activityData[key] === undefined) delete activityData[key];
    });

    const result = await crmService.createActivity(accessToken, activityData);
    logger.info(`Created activity: ${result.id}`);
    
    return { success: true, id: result.id, data: result };
  }

  private async updateDealAction(crmService: any, accessToken: string, fields: any) {
    const dealId = fields.deal_id || fields.id;
    
    if (!dealId) {
      throw new Error('Deal ID not provided');
    }

    const dealData = {};
    if (fields.stage_id) dealData['stage_id'] = fields.stage_id;
    if (fields.title) dealData['title'] = fields.title;
    if (fields.value) dealData['value'] = fields.value;

    const result = await crmService.updateDeal(accessToken, dealId, dealData);
    logger.info(`Updated deal: ${dealId}`);
    
    return { success: true, id: dealId, data: result };
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }
}

export const businessLogicEngine = new BusinessLogicEngine();