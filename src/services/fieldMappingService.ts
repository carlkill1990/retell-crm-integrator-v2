import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';

interface RetellWebhookData {
  call_id: string;
  call_type: 'inbound' | 'outbound';
  from_number: string;
  to_number: string;
  agent_id: string;
  call_status: string;
  call_analysis?: {
    call_summary?: string;
    call_successful?: boolean;
    custom_analysis_data?: Record<string, any>;
  };
  retell_llm_dynamic_variables?: Record<string, any>;
  metadata?: Record<string, any>;
  transcript?: string;
  duration_ms?: number;
  end_timestamp?: string;
  [key: string]: any;
}

interface FieldMapping {
  sourceField: string;
  targetField: string;
  transform?: string;
  required: boolean;
}

interface PipedrivePayload {
  person?: any;
  deal?: any;
  activity?: any;
  [key: string]: any;
}

export class FieldMappingService {
  
  /**
   * Transform Retell webhook data to Pipedrive format using field mappings
   */
  async transformWebhookData(
    retellData: RetellWebhookData,
    integrationId: string
  ): Promise<PipedrivePayload> {
    
    // Get integration with field mappings and CRM schema
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

    if (!integration) {
      throw new AppError('Integration not found', 404);
    }

    const fieldMappings = Array.isArray(integration.fieldMappings) 
      ? (integration.fieldMappings as unknown) as FieldMapping[] 
      : [];
    const crmSchema = integration.crmAccount.crmSchema as any;

    // Initialize Pipedrive payload structure
    const payload: PipedrivePayload = {};

    console.log(`🔄 Starting field mapping transformation for ${fieldMappings.length} mappings`);

    // Process each field mapping
    for (const mapping of fieldMappings) {
      try {
        console.log(`🔍 Processing mapping:`, { sourceField: mapping.sourceField, targetField: mapping.targetField, required: mapping.required });
        const sourceValue = this.extractSourceValue(retellData, mapping.sourceField);
        
        if (sourceValue === undefined || sourceValue === null) {
          if (mapping.required) {
            console.warn(`⚠️ Required field ${mapping.sourceField} is missing from Retell data`);
          }
          continue;
        }

        // Apply transformation if specified
        const transformedValue = this.applyTransformation(sourceValue, mapping.transform);
        
        // Map to target Pipedrive field
        this.mapToPipedriveField(payload, mapping.targetField, transformedValue, crmSchema);
        
        console.log(`✅ Mapped ${mapping.sourceField} → ${mapping.targetField}: ${transformedValue}`);
      } catch (error) {
        console.error(`❌ Error mapping field ${mapping.sourceField}:`, error);
        if (mapping.required) {
          throw new AppError(`Failed to map required field: ${mapping.sourceField}`, 400);
        }
      }
    }

    // Validate the transformed payload
    this.validatePipedrivePayload(payload, crmSchema);

    console.log(`✅ Field mapping completed. Payload:`, JSON.stringify(payload, null, 2));
    return payload;
  }

  /**
   * Extract value from Retell webhook data using field path
   */
  private extractSourceValue(data: RetellWebhookData, fieldPath: string): any {
    // Handle nested field paths like "call_analysis.call_summary"
    if (!fieldPath) {
      console.error(`❌ Error: fieldPath is undefined or empty`);
      return undefined;
    }
    
    const pathParts = fieldPath.split('.');
    let value: any = data;

    for (const part of pathParts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Apply transformation to field value
   */
  private applyTransformation(value: any, transform?: string): any {
    if (!transform || transform === 'none') {
      return value;
    }

    const stringValue = String(value);

    switch (transform) {
      case 'uppercase':
        return stringValue.toUpperCase();
      
      case 'lowercase':
        return stringValue.toLowerCase();
      
      case 'capitalize':
        return stringValue.charAt(0).toUpperCase() + stringValue.slice(1).toLowerCase();
      
      case 'truncate_100':
        return stringValue.length > 100 ? stringValue.substring(0, 100) + '...' : stringValue;
      
      case 'phone_format':
        // Basic phone formatting (remove non-digits, format as needed)
        const cleaned = stringValue.replace(/\D/g, '');
        if (cleaned.length === 10) {
          return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
        }
        return cleaned;
      
      default:
        console.warn(`Unknown transformation: ${transform}`);
        return value;
    }
  }

  /**
   * Map transformed value to Pipedrive field structure
   */
  private mapToPipedriveField(payload: PipedrivePayload, targetField: string, value: any, crmSchema: any): void {
    const fieldParts = targetField.split('.');
    
    // Handle different Pipedrive object types
    if (fieldParts[0] === 'person') {
      if (!payload.person) payload.person = {};
      this.setNestedValue(payload.person, fieldParts.slice(1), value, crmSchema);
    } 
    else if (fieldParts[0] === 'deal') {
      if (!payload.deal) payload.deal = {};
      this.setNestedValue(payload.deal, fieldParts.slice(1), value, crmSchema);
    }
    else if (fieldParts[0] === 'activity') {
      if (!payload.activity) payload.activity = {};
      this.setNestedValue(payload.activity, fieldParts.slice(1), value, crmSchema);
    }
    else {
      // Handle special field formats like deal.stage_id.123 or person.label_id.456
      this.handleSpecialFieldFormat(payload, targetField, value, crmSchema);
    }
  }

  /**
   * Handle special field formats like stage assignments, label assignments, etc.
   */
  private handleSpecialFieldFormat(payload: PipedrivePayload, targetField: string, value: any, crmSchema: any): void {
    // Pattern: deal.stage_id.123 (set deal stage to specific stage ID)
    const stageMatch = targetField.match(/^deal\.stage_id\.(\d+)$/);
    if (stageMatch) {
      if (!payload.deal) payload.deal = {};
      payload.deal.stage_id = parseInt(stageMatch[1]);
      return;
    }

    // Pattern: deal.custom_field.option_id (set custom field to specific option)
    const dealLabelMatch = targetField.match(/^deal\.([^.]+)\.(\d+)$/);
    if (dealLabelMatch && crmSchema.dealLabels) {
      const fieldKey = dealLabelMatch[1];
      const optionId = parseInt(dealLabelMatch[2]);
      
      const labelField = crmSchema.dealLabels.find((l: any) => l.field_key === fieldKey);
      if (labelField) {
        if (!payload.deal) payload.deal = {};
        payload.deal[fieldKey] = optionId;
        return;
      }
    }

    // Pattern: person.custom_field.option_id (set person custom field)
    const personLabelMatch = targetField.match(/^person\.([^.]+)\.(\d+)$/);
    if (personLabelMatch && crmSchema.personLabels) {
      const fieldKey = personLabelMatch[1];
      const optionId = parseInt(personLabelMatch[2]);
      
      const labelField = crmSchema.personLabels.find((l: any) => l.field_key === fieldKey);
      if (labelField) {
        if (!payload.person) payload.person = {};
        payload.person[fieldKey] = optionId;
        return;
      }
    }

    // Pattern: activity.type.123 (set activity type)
    const activityTypeMatch = targetField.match(/^activity\.type\.(\d+)$/);
    if (activityTypeMatch) {
      if (!payload.activity) payload.activity = {};
      payload.activity.type = activityTypeMatch[1];
      return;
    }

    // Pattern: *.owner_id.123 (set owner for any object)
    const ownerMatch = targetField.match(/^(\w+)\.owner_id\.(\d+)$/);
    if (ownerMatch) {
      const objectType = ownerMatch[1];
      const userId = parseInt(ownerMatch[2]);
      
      if (objectType === 'deal') {
        if (!payload.deal) payload.deal = {};
        payload.deal.owner_id = userId;
      } else if (objectType === 'person') {
        if (!payload.person) payload.person = {};
        payload.person.owner_id = userId;
      } else if (objectType === 'activity') {
        if (!payload.activity) payload.activity = {};
        payload.activity.owner_id = userId;
      }
      return;
    }

    console.warn(`Unknown field format: ${targetField}`);
  }

  /**
   * Set nested value in object using path array
   */
  private setNestedValue(obj: any, pathParts: string[], value: any, crmSchema: any): void {
    if (pathParts.length === 1) {
      obj[pathParts[0]] = value;
      return;
    }

    const [first, ...rest] = pathParts;
    if (!obj[first]) {
      obj[first] = {};
    }
    
    this.setNestedValue(obj[first], rest, value, crmSchema);
  }

  /**
   * Validate the Pipedrive payload before sending
   */
  private validatePipedrivePayload(payload: PipedrivePayload, crmSchema: any): void {
    // Validate person fields
    if (payload.person) {
      // Ensure required person fields if creating new person
      if (!payload.person.name && !payload.person.first_name && !payload.person.last_name) {
        console.warn('⚠️ Person payload missing name fields');
      }
    }

    // Validate deal fields
    if (payload.deal) {
      // Validate stage_id exists in schema
      if (payload.deal.stage_id && crmSchema.stages) {
        const stageExists = crmSchema.stages.some((s: any) => s.id === payload.deal.stage_id);
        if (!stageExists) {
          console.warn(`⚠️ Invalid stage_id: ${payload.deal.stage_id}`);
          delete payload.deal.stage_id;
        }
      }

      // Validate pipeline_id if provided
      if (payload.deal.pipeline_id && crmSchema.pipelines) {
        const pipelineExists = crmSchema.pipelines.some((p: any) => p.id === payload.deal.pipeline_id);
        if (!pipelineExists) {
          console.warn(`⚠️ Invalid pipeline_id: ${payload.deal.pipeline_id}`);
          delete payload.deal.pipeline_id;
        }
      }
    }

    // Validate activity fields
    if (payload.activity) {
      // Validate activity type
      if (payload.activity.type && crmSchema.activityTypes) {
        const typeExists = crmSchema.activityTypes.some((t: any) => t.id.toString() === payload.activity.type.toString());
        if (!typeExists) {
          console.warn(`⚠️ Invalid activity type: ${payload.activity.type}`);
          delete payload.activity.type;
        }
      }
    }

    console.log('✅ Pipedrive payload validation completed');
  }

  /**
   * Apply intelligent field mapping suggestions based on field names and types
   */
  async suggestFieldMappings(retellFields: any[], crmSchema: any): Promise<FieldMapping[]> {
    const suggestions: FieldMapping[] = [];

    // Common field mappings based on naming patterns
    const mappingRules = [
      // Phone number mappings
      { retellPattern: /^(from_number|to_number|phone)$/i, pipedriveField: 'person.phone', priority: 1 },
      
      // Name mappings
      { retellPattern: /^(name|full_name|customer_name)$/i, pipedriveField: 'person.name', priority: 1 },
      
      // Email mappings
      { retellPattern: /^(email|email_address)$/i, pipedriveField: 'person.email', priority: 1 },
      
      // Deal value mappings
      { retellPattern: /^(amount|value|price|cost)$/i, pipedriveField: 'deal.value', priority: 2 },
      
      // Deal title mappings
      { retellPattern: /^(deal_name|opportunity|title)$/i, pipedriveField: 'deal.title', priority: 2 },
      
      // Activity note mappings
      { retellPattern: /^(transcript|notes|description|summary)$/i, pipedriveField: 'activity.note', priority: 3 },
      
      // Activity subject mappings
      { retellPattern: /^(call_summary|subject|topic)$/i, pipedriveField: 'activity.subject', priority: 3 }
    ];

    for (const retellField of retellFields) {
      for (const rule of mappingRules) {
        if (rule.retellPattern.test(retellField.name || retellField.id)) {
          suggestions.push({
            sourceField: retellField.id,
            targetField: rule.pipedriveField,
            required: rule.priority === 1,
            transform: this.suggestTransformation(retellField, rule.pipedriveField)
          });
          break; // Only use first matching rule
        }
      }
    }

    return suggestions;
  }

  /**
   * Suggest appropriate transformation based on field types
   */
  private suggestTransformation(retellField: any, pipedriveField: string): string | undefined {
    // Phone formatting
    if (pipedriveField.includes('phone') && retellField.type === 'string') {
      return 'phone_format';
    }

    // Text truncation for long fields
    if (pipedriveField.includes('note') && retellField.type === 'text') {
      return undefined; // No truncation for notes
    }

    // Name capitalization
    if (pipedriveField.includes('name') && retellField.type === 'string') {
      return 'capitalize';
    }

    return undefined;
  }
}

export const fieldMappingService = new FieldMappingService();