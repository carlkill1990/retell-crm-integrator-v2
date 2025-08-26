import axios from 'axios';
import { oauthService } from './oauthService';
import { AppError } from '../middleware/errorHandler';

export class CRMService {
  async getLeads(accountId: string, provider: string, limit: number = 100) {
    const accessToken = await oauthService.getDecryptedAccessToken(accountId);
    
    switch (provider) {
      case 'pipedrive':
        return this.getPipedriveLeads(accessToken, limit);
      case 'hubspot':
        return this.getHubSpotLeads(accessToken, limit);
      case 'salesforce':
        return this.getSalesforceLeads(accessToken, limit);
      case 'zoho':
        return this.getZohoLeads(accessToken, limit);
      default:
        throw new AppError(`Unsupported CRM provider: ${provider}`, 400);
    }
  }

  async getContacts(accountId: string, provider: string, limit: number = 100) {
    const accessToken = await oauthService.getDecryptedAccessToken(accountId);
    
    switch (provider) {
      case 'pipedrive':
        return this.getPipedriveContacts(accessToken, limit);
      case 'hubspot':
        return this.getHubSpotContacts(accessToken, limit);
      case 'salesforce':
        return this.getSalesforceContacts(accessToken, limit);
      case 'zoho':
        return this.getZohoContacts(accessToken, limit);
      default:
        throw new AppError(`Unsupported CRM provider: ${provider}`, 400);
    }
  }

  async getFields(accountId: string, provider: string, objectType: string) {
    const accessToken = await oauthService.getDecryptedAccessToken(accountId);
    
    switch (provider) {
      case 'pipedrive':
        return this.getPipedriveFields(accessToken, objectType);
      case 'hubspot':
        return this.getHubSpotFields(accessToken, objectType);
      case 'salesforce':
        return this.getSalesforceFields(accessToken, objectType);
      case 'zoho':
        return this.getZohoFields(accessToken, objectType);
      default:
        throw new AppError(`Unsupported CRM provider: ${provider}`, 400);
    }
  }

  // Pipedrive implementations
  private async getPipedriveLeads(accessToken: string, limit: number) {
    const response = await axios.get('https://api.pipedrive.com/v1/leads', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { limit },
    });
    return response.data.data || [];
  }

  private async getPipedriveContacts(accessToken: string, limit: number) {
    const response = await axios.get('https://api.pipedrive.com/v1/persons', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { limit },
    });
    return response.data.data || [];
  }

  private async getPipedriveFields(accessToken: string, objectType: string) {
    const endpoint = objectType === 'leads' ? 'leadFields' : 'personFields';
    const response = await axios.get(`https://api.pipedrive.com/v1/${endpoint}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data.data || [];
  }

  // HubSpot implementations
  private async getHubSpotLeads(accessToken: string, limit: number) {
    const response = await axios.get('https://api.hubapi.com/crm/v3/objects/contacts', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { limit, properties: 'email,firstname,lastname,phone,company' },
    });
    return response.data.results || [];
  }

  private async getHubSpotContacts(accessToken: string, limit: number) {
    return this.getHubSpotLeads(accessToken, limit); // Same endpoint for HubSpot
  }

  private async getHubSpotFields(accessToken: string, objectType: string) {
    const response = await axios.get('https://api.hubapi.com/crm/v3/properties/contacts', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data.results || [];
  }

  // Salesforce implementations
  private async getSalesforceLeads(accessToken: string, limit: number) {
    const response = await axios.get('https://[instance].salesforce.com/services/data/v58.0/sobjects/Lead', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { limit },
    });
    return response.data.records || [];
  }

  private async getSalesforceContacts(accessToken: string, limit: number) {
    const response = await axios.get('https://[instance].salesforce.com/services/data/v58.0/sobjects/Contact', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { limit },
    });
    return response.data.records || [];
  }

  private async getSalesforceFields(accessToken: string, objectType: string) {
    const sobject = objectType === 'leads' ? 'Lead' : 'Contact';
    const response = await axios.get(`https://[instance].salesforce.com/services/data/v58.0/sobjects/${sobject}/describe`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data.fields || [];
  }

  // Zoho implementations
  private async getZohoLeads(accessToken: string, limit: number) {
    const response = await axios.get('https://www.zohoapis.com/crm/v2/Leads', {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      params: { per_page: limit },
    });
    return response.data.data || [];
  }

  private async getZohoContacts(accessToken: string, limit: number) {
    const response = await axios.get('https://www.zohoapis.com/crm/v2/Contacts', {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      params: { per_page: limit },
    });
    return response.data.data || [];
  }

  private async getZohoFields(accessToken: string, objectType: string) {
    const module = objectType === 'leads' ? 'Leads' : 'Contacts';
    const response = await axios.get(`https://www.zohoapis.com/crm/v2/settings/fields?module=${module}`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });
    return response.data.fields || [];
  }
}

export const crmService = new CRMService();