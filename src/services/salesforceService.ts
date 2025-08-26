import axios from 'axios';
import { logger } from '../config/logger';

interface SalesforceCall {
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

class SalesforceService implements SalesforceCall {
  private getInstanceUrl(accessToken: string): string {
    // In practice, you'd store the instance URL during OAuth
    // For now, using a placeholder - this would come from the CRM account config
    return 'https://your-instance.salesforce.com';
  }

  private getAxiosInstance(accessToken: string) {
    return axios.create({
      baseURL: `${this.getInstanceUrl(accessToken)}/services/data/v58.0`,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async createDeal(accessToken: string, dealData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      
      const salesforceOpportunityData = {
        Name: dealData.title || dealData.name,
        Amount: dealData.value || dealData.amount,
        StageName: dealData.stage_name || 'Prospecting',
        CloseDate: dealData.close_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
        AccountId: dealData.account_id,
        ContactId: dealData.person_id || dealData.contact_id,
      };

      const response = await api.post('/sobjects/Opportunity', salesforceOpportunityData);
      
      logger.info('Salesforce opportunity created:', { opportunityId: response.data.id });
      return response.data;
    } catch (error: any) {
      logger.error('Salesforce createDeal error:', error.response?.data || error.message);
      throw new Error(`Failed to create Salesforce opportunity: ${error.response?.data?.[0]?.message || error.message}`);
    }
  }

  async updateDeal(accessToken: string, dealId: string, dealData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      
      const salesforceOpportunityData: any = {};
      if (dealData.title) salesforceOpportunityData.Name = dealData.title;
      if (dealData.value) salesforceOpportunityData.Amount = dealData.value;
      if (dealData.stage_name) salesforceOpportunityData.StageName = dealData.stage_name;
      if (dealData.close_date) salesforceOpportunityData.CloseDate = dealData.close_date;

      const response = await api.patch(`/sobjects/Opportunity/${dealId}`, salesforceOpportunityData);
      
      logger.info('Salesforce opportunity updated:', { opportunityId: dealId });
      return { id: dealId, success: true };
    } catch (error: any) {
      logger.error('Salesforce updateDeal error:', error.response?.data || error.message);
      throw new Error(`Failed to update Salesforce opportunity: ${error.response?.data?.[0]?.message || error.message}`);
    }
  }

  async createPerson(accessToken: string, personData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      
      const salesforceContactData = {
        FirstName: personData.first_name || personData.firstname,
        LastName: personData.last_name || personData.lastname || 'Unknown',
        Email: personData.email,
        Phone: personData.phone,
        AccountId: personData.account_id,
      };

      const response = await api.post('/sobjects/Contact', salesforceContactData);
      
      logger.info('Salesforce contact created:', { contactId: response.data.id });
      return response.data;
    } catch (error: any) {
      logger.error('Salesforce createPerson error:', error.response?.data || error.message);
      throw new Error(`Failed to create Salesforce contact: ${error.response?.data?.[0]?.message || error.message}`);
    }
  }

  async updatePerson(accessToken: string, personId: string, personData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      
      const salesforceContactData: any = {};
      if (personData.first_name) salesforceContactData.FirstName = personData.first_name;
      if (personData.last_name) salesforceContactData.LastName = personData.last_name;
      if (personData.email) salesforceContactData.Email = personData.email;
      if (personData.phone) salesforceContactData.Phone = personData.phone;

      const response = await api.patch(`/sobjects/Contact/${personId}`, salesforceContactData);
      
      logger.info('Salesforce contact updated:', { contactId: personId });
      return { id: personId, success: true };
    } catch (error: any) {
      logger.error('Salesforce updatePerson error:', error.response?.data || error.message);
      throw new Error(`Failed to update Salesforce contact: ${error.response?.data?.[0]?.message || error.message}`);
    }
  }

  async createActivity(accessToken: string, activityData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      
      const salesforceTaskData = {
        Subject: activityData.subject || 'Call Activity',
        Description: activityData.note,
        ActivityDate: activityData.due_date || new Date().toISOString().split('T')[0],
        Status: activityData.done ? 'Completed' : 'Not Started',
        Priority: 'Normal',
        WhoId: activityData.person_id || activityData.contact_id,
        WhatId: activityData.deal_id || activityData.opportunity_id,
        Type: activityData.type || 'Call',
      };

      const response = await api.post('/sobjects/Task', salesforceTaskData);
      
      logger.info('Salesforce task created:', { taskId: response.data.id });
      return response.data;
    } catch (error: any) {
      logger.error('Salesforce createActivity error:', error.response?.data || error.message);
      throw new Error(`Failed to create Salesforce task: ${error.response?.data?.[0]?.message || error.message}`);
    }
  }

  async updateActivity(accessToken: string, activityId: string, activityData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      
      const salesforceTaskData: any = {};
      if (activityData.subject) salesforceTaskData.Subject = activityData.subject;
      if (activityData.note) salesforceTaskData.Description = activityData.note;
      if (activityData.due_date) salesforceTaskData.ActivityDate = activityData.due_date;
      if (activityData.done !== undefined) salesforceTaskData.Status = activityData.done ? 'Completed' : 'Not Started';

      const response = await api.patch(`/sobjects/Task/${activityId}`, salesforceTaskData);
      
      logger.info('Salesforce task updated:', { taskId: activityId });
      return { id: activityId, success: true };
    } catch (error: any) {
      logger.error('Salesforce updateActivity error:', error.response?.data || error.message);
      throw new Error(`Failed to update Salesforce task: ${error.response?.data?.[0]?.message || error.message}`);
    }
  }

  async getDeals(accessToken: string, filters?: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      let query = 'SELECT Id, Name, Amount, StageName, CloseDate, AccountId, ContactId FROM Opportunity';
      
      if (filters?.limit) {
        query += ` LIMIT ${filters.limit}`;
      }

      const response = await api.get(`/query?q=${encodeURIComponent(query)}`);
      
      return response.data.records;
    } catch (error: any) {
      logger.error('Salesforce getDeals error:', error.response?.data || error.message);
      throw new Error(`Failed to get Salesforce opportunities: ${error.response?.data?.[0]?.message || error.message}`);
    }
  }

  async getPersons(accessToken: string, filters?: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      let query = 'SELECT Id, FirstName, LastName, Email, Phone, AccountId FROM Contact';
      
      if (filters?.limit) {
        query += ` LIMIT ${filters.limit}`;
      }

      const response = await api.get(`/query?q=${encodeURIComponent(query)}`);
      
      return response.data.records;
    } catch (error: any) {
      logger.error('Salesforce getPersons error:', error.response?.data || error.message);
      throw new Error(`Failed to get Salesforce contacts: ${error.response?.data?.[0]?.message || error.message}`);
    }
  }

  async getActivities(accessToken: string, filters?: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      let query = 'SELECT Id, Subject, Description, ActivityDate, Status, WhoId, WhatId FROM Task';
      
      if (filters?.limit) {
        query += ` LIMIT ${filters.limit}`;
      }

      const response = await api.get(`/query?q=${encodeURIComponent(query)}`);
      
      return response.data.records;
    } catch (error: any) {
      logger.error('Salesforce getActivities error:', error.response?.data || error.message);
      throw new Error(`Failed to get Salesforce tasks: ${error.response?.data?.[0]?.message || error.message}`);
    }
  }
}

export const salesforceService = new SalesforceService();