import { logger } from '../config/logger';

export interface DealTitleComponents {
  name?: string;
  topic?: string;
  phoneNumber?: string;
}

export class DealTitleGenerator {
  /**
   * Generate a consistent deal title from webhook data
   * Format: "[Name] - [Topic]" or "[Phone] - [Topic]" as fallback
   */
  static generateDealTitle(callData: any): string {
    const components = this.extractComponents(callData);
    
    // Primary format: "Name - Topic"
    if (components.name && components.topic) {
      return `${components.name} - ${components.topic}`;
    }
    
    // Fallback with name only
    if (components.name) {
      return `${components.name} - Consultation`;
    }
    
    // Fallback with topic only
    if (components.topic && components.phoneNumber) {
      return `${components.phoneNumber} - ${components.topic}`;
    }
    
    // Final fallback
    const phone = components.phoneNumber || 'Unknown Caller';
    return `${phone} - Service Inquiry`;
  }

  /**
   * Extract name, topic, and phone number from call data
   */
  static extractComponents(callData: any): DealTitleComponents {
    const components: DealTitleComponents = {};
    
    // Extract phone number
    components.phoneNumber = this.extractPhoneNumber(callData);
    
    // Extract name and topic from call summary
    const callSummary = callData.call_analysis?.call_summary || '';
    if (callSummary) {
      components.name = this.extractNameFromSummary(callSummary);
      components.topic = this.extractTopicFromSummary(callSummary);
    }
    
    // Try dynamic variables as backup
    if (!components.name) {
      components.name = this.extractNameFromDynamicVars(callData.retell_llm_dynamic_variables);
    }
    
    logger.info('Deal title components extracted:', components);
    return components;
  }

  /**
   * Extract person name from call summary using common patterns
   */
  private static extractNameFromSummary(summary: string): string | undefined {
    // Common name patterns in call summaries
    const namePatterns = [
      /The user,?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*?)(?:\s+from|,)/i, // "The user, John Smith from" or "The user, John Smith,"
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*?)\s+from/i, // "John Smith from"
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*?)\s+called/i, // "John Smith called"
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*?)\s+successfully/i, // "John Smith successfully"
      /caller\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i, // "caller John Smith"
      /customer\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i, // "customer John Smith"
    ];

    for (const pattern of namePatterns) {
      const match = summary.match(pattern);
      if (match && match[1]) {
        let name = match[1].trim();
        
        // Clean up common additions that aren't part of the name
        name = name.replace(/\s+(from|at|with|of|and).*$/i, '');
        
        // Validate it's a reasonable name (not too long, contains letters, max 2-3 words)
        const words = name.split(' ');
        if (name.length <= 30 && words.length <= 3 && /^[A-Za-z\s]+$/.test(name)) {
          return name;
        }
      }
    }
    
    return undefined;
  }

  /**
   * Extract main topic/service from call summary
   */
  private static extractTopicFromSummary(summary: string): string | undefined {
    // Topic patterns - what the call was about
    const topicPatterns = [
      /booked?\s+(?:a\s+)?([^.]+)(?:\s+for|\s+due|\.)/i, // "booked a consultation"
      /(?:about|regarding|for)\s+([^.]+?)(?:\s+due|\.)/i, // "about lead generation"
      /inquired?\s+about\s+([^.]+)(?:\.|\s+for)/i, // "inquired about pricing"
      /called\s+about\s+([^.]+)(?:\.|\s+for)/i, // "called about services"
      /consultation\s+for\s+([^.]+)/i, // "consultation for creating"
      /interested\s+in\s+([^.]+)/i, // "interested in services"
    ];

    for (const pattern of topicPatterns) {
      const match = summary.match(pattern);
      if (match && match[1]) {
        let topic = match[1].trim();
        
        // Clean up the topic
        topic = topic.replace(/^(a|an|the)\s+/i, ''); // Remove articles
        topic = topic.replace(/\s+/g, ' '); // Normalize spaces
        topic = topic.replace(/\s+(due to|because of|for).*$/i, ''); // Remove long explanations
        topic = this.capitalizeFirst(topic);
        
        // Limit to reasonable length (shorter titles)
        if (topic.length > 40) {
          topic = topic.substring(0, 40).trim() + '...';
        }
        
        // Validate reasonable length
        if (topic.length <= 50 && topic.length > 0) {
          return topic;
        }
      }
    }
    
    // Fallback: look for common service keywords
    const serviceKeywords = [
      'consultation', 'appointment', 'booking', 'inquiry', 'quote',
      'information', 'pricing', 'services', 'meeting', 'demo', 'call'
    ];
    
    for (const keyword of serviceKeywords) {
      if (summary.toLowerCase().includes(keyword)) {
        return this.capitalizeFirst(keyword);
      }
    }
    
    return undefined;
  }

  /**
   * Extract name from dynamic variables (fallback)
   */
  private static extractNameFromDynamicVars(dynamicVars: any): string | undefined {
    if (!dynamicVars) return undefined;
    
    // Common variable names for person names
    const nameFields = [
      'name', 'customer_name', 'full_name', 'client_name', 'user_name',
      'first_name', 'caller_name', 'contact_name', 'lead_name'
    ];
    
    for (const field of nameFields) {
      const value = dynamicVars[field];
      if (value && typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    
    // Try combining first + last name
    const firstName = dynamicVars.first_name || dynamicVars.fname;
    const lastName = dynamicVars.last_name || dynamicVars.lname;
    if (firstName && lastName) {
      return `${firstName.trim()} ${lastName.trim()}`;
    }
    
    return undefined;
  }

  /**
   * Extract phone number from call data
   */
  private static extractPhoneNumber(callData: any): string | undefined {
    return callData.from_number || callData.to_number || undefined;
  }

  /**
   * Capitalize first letter of a string
   */
  private static capitalizeFirst(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
}