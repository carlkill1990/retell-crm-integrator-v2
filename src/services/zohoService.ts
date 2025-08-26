import axios from 'axios';
import { logger } from '../config/logger';

interface ZohoCall {
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

class ZohoService implements ZohoCall {
  private baseURL = 'https://www.zohoapis.com/crm/v3';

  private getAxiosInstance(accessToken: string) {
    return axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async createDeal(accessToken: string, dealData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      
      const zohoDealData = {
        data: [{
          Deal_Name: dealData.title || dealData.deal_name,
          Amount: dealData.value || dealData.amount,
          Stage: dealData.stage_name || 'Qualification',
          Closing_Date: dealData.close_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          Contact_Name: dealData.person_id ? { id: dealData.person_id } : null,
          Account_Name: dealData.account_id ? { id: dealData.account_id } : null,
        }]
      };

      const response = await api.post('/Deals', zohoDealData);
      
      if (response.data.data && response.data.data.length > 0) {
        logger.info('Zoho deal created:', { dealId: response.data.data[0].details.id });
        return response.data.data[0].details;
      }
      
      throw new Error('No deal data returned from Zoho');
    } catch (error: any) {
      logger.error('Zoho createDeal error:', error.response?.data || error.message);
      throw new Error(`Failed to create Zoho deal: ${error.response?.data?.message || error.message}`);
    }
  }

  async updateDeal(accessToken: string, dealId: string, dealData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      
      const zohoDealData: any = {
        data: [{ id: dealId }]
      };

      if (dealData.title) zohoDealData.data[0].Deal_Name = dealData.title;
      if (dealData.value) zohoDealData.data[0].Amount = dealData.value;
      if (dealData.stage_name) zohoDealData.data[0].Stage = dealData.stage_name;
      if (dealData.close_date) zohoDealData.data[0].Closing_Date = dealData.close_date;

      const response = await api.put('/Deals', zohoDealData);
      
      logger.info('Zoho deal updated:', { dealId });
      return { id: dealId, success: true };
    } catch (error: any) {
      logger.error('Zoho updateDeal error:', error.response?.data || error.message);
      throw new Error(`Failed to update Zoho deal: ${error.response?.data?.message || error.message}`);
    }
  }

  async createPerson(accessToken: string, personData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      
      const zohoContactData = {
        data: [{
          First_Name: personData.first_name || personData.firstname,
          Last_Name: personData.last_name || personData.lastname || 'Unknown',
          Email: personData.email,
          Phone: personData.phone,
          Account_Name: personData.account_id ? { id: personData.account_id } : null,
        }]
      };

      const response = await api.post('/Contacts', zohoContactData);
      
      if (response.data.data && response.data.data.length > 0) {
        logger.info('Zoho contact created:', { contactId: response.data.data[0].details.id });
        return response.data.data[0].details;
      }
      
      throw new Error('No contact data returned from Zoho');
    } catch (error: any) {
      logger.error('Zoho createPerson error:', error.response?.data || error.message);
      throw new Error(`Failed to create Zoho contact: ${error.response?.data?.message || error.message}`);
    }
  }

  async updatePerson(accessToken: string, personId: string, personData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      
      const zohoContactData: any = {
        data: [{ id: personId }]
      };

      if (personData.first_name) zohoContactData.data[0].First_Name = personData.first_name;
      if (personData.last_name) zohoContactData.data[0].Last_Name = personData.last_name;
      if (personData.email) zohoContactData.data[0].Email = personData.email;
      if (personData.phone) zohoContactData.data[0].Phone = personData.phone;

      const response = await api.put('/Contacts', zohoContactData);
      
      logger.info('Zoho contact updated:', { contactId: personId });
      return { id: personId, success: true };
    } catch (error: any) {
      logger.error('Zoho updatePerson error:', error.response?.data || error.message);
      throw new Error(`Failed to update Zoho contact: ${error.response?.data?.message || error.message}`);
    }
  }

  async createActivity(accessToken: string, activityData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      
      const zohoTaskData = {
        data: [{
          Subject: activityData.subject || 'Call Activity',
          Description: activityData.note,
          Due_Date: activityData.due_date || new Date().toISOString().split('T')[0],
          Status: activityData.done ? 'Completed' : 'Not Started',
          Priority: 'Normal',
          What_Id: activityData.deal_id ? { id: activityData.deal_id } : null,
          Who_Id: activityData.person_id ? { id: activityData.person_id } : null,
          Task_Type: activityData.type || 'Call',
        }]
      };

      const response = await api.post('/Tasks', zohoTaskData);
      
      if (response.data.data && response.data.data.length > 0) {
        logger.info('Zoho task created:', { taskId: response.data.data[0].details.id });
        return response.data.data[0].details;
      }
      
      throw new Error('No task data returned from Zoho');
    } catch (error: any) {
      logger.error('Zoho createActivity error:', error.response?.data || error.message);
      throw new Error(`Failed to create Zoho task: ${error.response?.data?.message || error.message}`);
    }
  }

  async updateActivity(accessToken: string, activityId: string, activityData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      
      const zohoTaskData: any = {
        data: [{ id: activityId }]
      };

      if (activityData.subject) zohoTaskData.data[0].Subject = activityData.subject;
      if (activityData.note) zohoTaskData.data[0].Description = activityData.note;
      if (activityData.due_date) zohoTaskData.data[0].Due_Date = activityData.due_date;
      if (activityData.done !== undefined) zohoTaskData.data[0].Status = activityData.done ? 'Completed' : 'Not Started';

      const response = await api.put('/Tasks', zohoTaskData);
      
      logger.info('Zoho task updated:', { taskId: activityId });
      return { id: activityId, success: true };
    } catch (error: any) {
      logger.error('Zoho updateActivity error:', error.response?.data || error.message);
      throw new Error(`Failed to update Zoho task: ${error.response?.data?.message || error.message}`);
    }
  }

  async getDeals(accessToken: string, filters?: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      const params: any = {};
      
      if (filters?.limit) params.per_page = filters.limit;
      if (filters?.page) params.page = filters.page;

      const response = await api.get('/Deals', { params });
      
      return response.data.data || [];
    } catch (error: any) {
      logger.error('Zoho getDeals error:', error.response?.data || error.message);
      throw new Error(`Failed to get Zoho deals: ${error.response?.data?.message || error.message}`);
    }
  }

  async getPersons(accessToken: string, filters?: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      const params: any = {};
      
      if (filters?.limit) params.per_page = filters.limit;
      if (filters?.page) params.page = filters.page;

      const response = await api.get('/Contacts', { params });
      
      return response.data.data || [];
    } catch (error: any) {
      logger.error('Zoho getPersons error:', error.response?.data || error.message);
      throw new Error(`Failed to get Zoho contacts: ${error.response?.data?.message || error.message}`);
    }
  }

  async getActivities(accessToken: string, filters?: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      const params: any = {};
      
      if (filters?.limit) params.per_page = filters.limit;
      if (filters?.page) params.page = filters.page;

      const response = await api.get('/Tasks', { params });
      
      return response.data.data || [];
    } catch (error: any) {
      logger.error('Zoho getActivities error:', error.response?.data || error.message);
      throw new Error(`Failed to get Zoho tasks: ${error.response?.data?.message || error.message}`);
    }
  }

  async getStages(accessToken: string): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      const response = await api.get('/settings/fields?module=Deals&type=picklist');
      
      const stageField = response.data.fields?.find((field: any) => field.api_name === 'Stage');
      return stageField?.pick_list_values || [];
    } catch (error: any) {
      logger.error('Zoho getStages error:', error.response?.data || error.message);
      throw new Error(`Failed to get Zoho stages: ${error.response?.data?.message || error.message}`);
    }
  }
}

export const zohoService = new ZohoService();