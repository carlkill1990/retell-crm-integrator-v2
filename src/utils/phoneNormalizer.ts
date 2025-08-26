/**
 * Phone Number Normalization Utility
 * Handles different phone number formats for better contact matching
 */

export interface PhoneVariation {
  format: string;
  description: string;
}

export class PhoneNormalizer {
  /**
   * Generate multiple phone number variations for searching
   */
  static generateVariations(phone: string): PhoneVariation[] {
    if (!phone) return [];
    
    // Clean the input - remove all non-digit characters except +
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    
    const variations: PhoneVariation[] = [];
    
    // Add original format
    variations.push({
      format: phone,
      description: 'original'
    });
    
    // If it starts with +44, create UK variations
    if (cleanPhone.startsWith('+44')) {
      const ukNumber = cleanPhone.substring(3); // Remove +44
      
      // +447366842442 -> 07366842442
      if (ukNumber.startsWith('7')) {
        variations.push({
          format: `0${ukNumber}`,
          description: 'uk_local'
        });
      }
      
      // +447366842442 -> 447366842442 (without +)
      variations.push({
        format: `44${ukNumber}`,
        description: 'international_no_plus'
      });
    }
    
    // If it starts with 0, create international variations
    else if (cleanPhone.startsWith('0')) {
      const localNumber = cleanPhone.substring(1); // Remove leading 0
      
      // 07366842442 -> +447366842442
      if (localNumber.startsWith('7')) {
        variations.push({
          format: `+44${localNumber}`,
          description: 'international_plus'
        });
        
        // 07366842442 -> 447366842442
        variations.push({
          format: `44${localNumber}`,
          description: 'international_no_plus'
        });
      }
    }
    
    // If it starts with 44 (but not +44), add + version
    else if (cleanPhone.startsWith('44') && !cleanPhone.startsWith('+')) {
      variations.push({
        format: `+${cleanPhone}`,
        description: 'add_plus'
      });
      
      // 447366842442 -> 07366842442
      const ukNumber = cleanPhone.substring(2);
      if (ukNumber.startsWith('7')) {
        variations.push({
          format: `0${ukNumber}`,
          description: 'uk_local'
        });
      }
    }
    
    // Remove duplicates and return
    const uniqueVariations = variations.filter((v, i, arr) => 
      arr.findIndex(x => x.format === v.format) === i
    );
    
    return uniqueVariations;
  }
  
  /**
   * Normalize phone number to a standard format for storage/comparison
   */
  static normalize(phone: string): string {
    if (!phone) return '';
    
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    
    // Convert UK local format to international
    if (cleanPhone.startsWith('0')) {
      const localNumber = cleanPhone.substring(1);
      if (localNumber.startsWith('7')) {
        return `+44${localNumber}`;
      }
    }
    
    // Add + to international format if missing
    if (cleanPhone.startsWith('44') && !cleanPhone.startsWith('+')) {
      return `+${cleanPhone}`;
    }
    
    return cleanPhone;
  }
  
  /**
   * Check if two phone numbers are equivalent
   */
  static areEquivalent(phone1: string, phone2: string): boolean {
    if (!phone1 || !phone2) return false;
    
    const normalized1 = this.normalize(phone1);
    const normalized2 = this.normalize(phone2);
    
    return normalized1 === normalized2;
  }
}