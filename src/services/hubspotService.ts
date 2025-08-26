import axios from 'axios';
import { logger } from '../config/logger';

interface HubSpotCall {
  createDeal(accessToken: string, dealData: any): Promise<any>;
  updateDeal(accessToken: string, dealId: string, dealData: any): Promise<any>;
  createPerson(accessToken: string, personData: any): Promise<any>;
  updatePerson(accessToken: string, personId: string, personData: any): Promise<any>;
  createActivity(accessToken: string, activityData: any): Promise<any>;
  updateActivity(accessToken: string, activityId: string, activityData: any): Promise<any>;
  getDeals(accessToken: string, filters?: any): Promise<any>;
  getPersons(accessToken: string, filters?: any): Promise<any>;
  getActivities(accessToken: string, filters?: any): Promise<any>;
}

class HubSpotService implements HubSpotCall {
  private baseURL = 'https://api.hubapi.com';

  private getAxiosInstance(accessToken: string) {
    return axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async createDeal(accessToken: string, dealData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      
      const hubspotDealData = {
        properties: {
          dealname: dealData.title || dealData.dealname,
          amount: dealData.value || dealData.amount,
          dealstage: dealData.stage_id || dealData.dealstage,
          pipeline: dealData.pipeline_id || dealData.pipeline,
          closedate: dealData.close_date || dealData.closedate,
        }
      };

      if (dealData.person_id || dealData.contact_id) {
        hubspotDealData['associations'] = [{
          to: { id: dealData.person_id || dealData.contact_id },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }]
        }];
      }

      const response = await api.post('/crm/v3/objects/deals', hubspotDealData);
      
      logger.info('HubSpot deal created:', { dealId: response.data.id });
      return response.data;
    } catch (error: any) {
      logger.error('HubSpot createDeal error:', error.response?.data || error.message);
      throw new Error(`Failed to create HubSpot deal: ${error.response?.data?.message || error.message}`);
    }
  }

  async updateDeal(accessToken: string, dealId: string, dealData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      
      const hubspotDealData = {
        properties: {}
      };

      if (dealData.title) hubspotDealData.properties['dealname'] = dealData.title;
      if (dealData.value) hubspotDealData.properties['amount'] = dealData.value;
      if (dealData.stage_id) hubspotDealData.properties['dealstage'] = dealData.stage_id;
      if (dealData.pipeline_id) hubspotDealData.properties['pipeline'] = dealData.pipeline_id;

      const response = await api.patch(`/crm/v3/objects/deals/${dealId}`, hubspotDealData);
      
      logger.info('HubSpot deal updated:', { dealId });
      return response.data;
    } catch (error: any) {
      logger.error('HubSpot updateDeal error:', error.response?.data || error.message);
      throw new Error(`Failed to update HubSpot deal: ${error.response?.data?.message || error.message}`);
    }
  }

  async createPerson(accessToken: string, personData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      
      const hubspotContactData = {
        properties: {
          firstname: personData.first_name || personData.firstname,
          lastname: personData.last_name || personData.lastname,
          email: personData.email,
          phone: personData.phone,
          company: personData.org_name || personData.company,
        }
      };

      const response = await api.post('/crm/v3/objects/contacts', hubspotContactData);
      
      logger.info('HubSpot contact created:', { contactId: response.data.id });
      return response.data;
    } catch (error: any) {
      logger.error('HubSpot createPerson error:', error.response?.data || error.message);
      throw new Error(`Failed to create HubSpot contact: ${error.response?.data?.message || error.message}`);
    }
  }

  async updatePerson(accessToken: string, personId: string, personData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      
      const hubspotContactData = {
        properties: {}
      };

      if (personData.first_name) hubspotContactData.properties['firstname'] = personData.first_name;
      if (personData.last_name) hubspotContactData.properties['lastname'] = personData.last_name;
      if (personData.email) hubspotContactData.properties['email'] = personData.email;
      if (personData.phone) hubspotContactData.properties['phone'] = personData.phone;
      if (personData.company) hubspotContactData.properties['company'] = personData.company;

      const response = await api.patch(`/crm/v3/objects/contacts/${personId}`, hubspotContactData);
      
      logger.info('HubSpot contact updated:', { contactId: personId });
      return response.data;
    } catch (error: any) {
      logger.error('HubSpot updatePerson error:', error.response?.data || error.message);
      throw new Error(`Failed to update HubSpot contact: ${error.response?.data?.message || error.message}`);
    }
  }

  async createActivity(accessToken: string, activityData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      
      const hubspotActivityData = {
        properties: {
          hs_activity_type: activityData.type || 'CALL',
          hs_task_subject: activityData.subject,
          hs_task_body: activityData.note,
          hs_timestamp: new Date().toISOString(),
          hubspot_owner_id: activityData.owner_id,
        }
      };

      if (activityData.person_id || activityData.contact_id) {
        hubspotActivityData['associations'] = [{
          to: { id: activityData.person_id || activityData.contact_id },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 }]
        }];
      }

      if (activityData.deal_id) {
        if (!hubspotActivityData['associations']) hubspotActivityData['associations'] = [];
        hubspotActivityData['associations'].push({
          to: { id: activityData.deal_id },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 5 }]
        });
      }

      const response = await api.post('/crm/v3/objects/tasks', hubspotActivityData);
      
      logger.info('HubSpot activity created:', { activityId: response.data.id });
      return response.data;
    } catch (error: any) {
      logger.error('HubSpot createActivity error:', error.response?.data || error.message);
      throw new Error(`Failed to create HubSpot activity: ${error.response?.data?.message || error.message}`);
    }
  }

  async updateActivity(accessToken: string, activityId: string, activityData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      
      const hubspotActivityData = {
        properties: {}
      };

      if (activityData.subject) hubspotActivityData.properties['hs_task_subject'] = activityData.subject;
      if (activityData.note) hubspotActivityData.properties['hs_task_body'] = activityData.note;
      if (activityData.type) hubspotActivityData.properties['hs_activity_type'] = activityData.type;

      const response = await api.patch(`/crm/v3/objects/tasks/${activityId}`, hubspotActivityData);
      
      logger.info('HubSpot activity updated:', { activityId });
      return response.data;
    } catch (error: any) {
      logger.error('HubSpot updateActivity error:', error.response?.data || error.message);
      throw new Error(`Failed to update HubSpot activity: ${error.response?.data?.message || error.message}`);
    }
  }

  async getDeals(accessToken: string, filters?: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      const response = await api.get('/crm/v3/objects/deals', { params: filters });
      
      return response.data.results;
    } catch (error: any) {
      logger.error('HubSpot getDeals error:', error.response?.data || error.message);
      throw new Error(`Failed to get HubSpot deals: ${error.response?.data?.message || error.message}`);
    }
  }

  async getPersons(accessToken: string, filters?: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      const response = await api.get('/crm/v3/objects/contacts', { params: filters });
      
      return response.data.results;
    } catch (error: any) {
      logger.error('HubSpot getPersons error:', error.response?.data || error.message);
      throw new Error(`Failed to get HubSpot contacts: ${error.response?.data?.message || error.message}`);
    }
  }

  async getActivities(accessToken: string, filters?: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      const response = await api.get('/crm/v3/objects/tasks', { params: filters });
      
      return response.data.results;
    } catch (error: any) {
      logger.error('HubSpot getActivities error:', error.response?.data || error.message);
      throw new Error(`Failed to get HubSpot activities: ${error.response?.data?.message || error.message}`);
    }
  }

  async getPipelines(accessToken: string): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      const response = await api.get('/crm/v3/pipelines/deals');
      
      return response.data.results;
    } catch (error: any) {
      logger.error('HubSpot getPipelines error:', error.response?.data || error.message);
      throw new Error(`Failed to get HubSpot pipelines: ${error.response?.data?.message || error.message}`);
    }
  }

  async getStages(accessToken: string, pipelineId?: string): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      const url = pipelineId ? `/crm/v3/pipelines/deals/${pipelineId}/stages` : '/crm/v3/pipelines/deals';
      const response = await api.get(url);
      
      return pipelineId ? response.data.results : response.data.results.flatMap((p: any) => p.stages);
    } catch (error: any) {
      logger.error('HubSpot getStages error:', error.response?.data || error.message);
      throw new Error(`Failed to get HubSpot stages: ${error.response?.data?.message || error.message}`);
    }
  }
}

export const hubspotService = new HubSpotService();