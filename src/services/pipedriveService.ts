import axios from 'axios';
import { logger } from '../config/logger';

interface PipedriveConfig {
  apiToken: string;
  companyDomain?: string;
}

interface PipedriveCall {
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

class PipedriveService implements PipedriveCall {
  private baseURL = 'https://api.pipedrive.com/v1';

  private getAxiosInstance(accessToken: string) {
    return axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    });
  }

  async createDeal(accessToken: string, dealData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      const response = await api.post('/deals', dealData);
      
      logger.info('Pipedrive deal created:', { dealId: response.data.data.id });
      return response.data.data;
    } catch (error: any) {
      logger.error('Pipedrive createDeal error:', error.response?.data || error.message);
      throw new Error(`Failed to create Pipedrive deal: ${error.response?.data?.error || error.message}`);
    }
  }

  async updateDeal(accessToken: string, dealId: string, dealData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      const response = await api.put(`/deals/${dealId}`, dealData);
      
      logger.info('Pipedrive deal updated:', { dealId });
      return response.data.data;
    } catch (error: any) {
      logger.error('Pipedrive updateDeal error:', error.response?.data || error.message);
      throw new Error(`Failed to update Pipedrive deal: ${error.response?.data?.error || error.message}`);
    }
  }

  async createPerson(accessToken: string, personData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      const response = await api.post('/persons', personData);
      
      logger.info('Pipedrive person created:', { personId: response.data.data.id });
      return response.data.data;
    } catch (error: any) {
      logger.error('Pipedrive createPerson error:', error.response?.data || error.message);
      throw new Error(`Failed to create Pipedrive person: ${error.response?.data?.error || error.message}`);
    }
  }

  async updatePerson(accessToken: string, personId: string, personData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      const response = await api.put(`/persons/${personId}`, personData);
      
      logger.info('Pipedrive person updated:', { personId });
      return response.data.data;
    } catch (error: any) {
      logger.error('Pipedrive updatePerson error:', error.response?.data || error.message);
      throw new Error(`Failed to update Pipedrive person: ${error.response?.data?.error || error.message}`);
    }
  }

  async createActivity(accessToken: string, activityData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      const response = await api.post('/activities', activityData);
      
      logger.info('Pipedrive activity created:', { activityId: response.data.data.id });
      return response.data.data;
    } catch (error: any) {
      logger.error('Pipedrive createActivity error:', error.response?.data || error.message);
      throw new Error(`Failed to create Pipedrive activity: ${error.response?.data?.error || error.message}`);
    }
  }

  async updateActivity(accessToken: string, activityId: string, activityData: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      const response = await api.put(`/activities/${activityId}`, activityData);
      
      logger.info('Pipedrive activity updated:', { activityId });
      return response.data.data;
    } catch (error: any) {
      logger.error('Pipedrive updateActivity error:', error.response?.data || error.message);
      throw new Error(`Failed to update Pipedrive activity: ${error.response?.data?.error || error.message}`);
    }
  }

  async getDeals(accessToken: string, filters?: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      const response = await api.get('/deals', { params: filters });
      
      return response.data.data;
    } catch (error: any) {
      logger.error('Pipedrive getDeals error:', error.response?.data || error.message);
      throw new Error(`Failed to get Pipedrive deals: ${error.response?.data?.error || error.message}`);
    }
  }

  async getPersons(accessToken: string, filters?: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      const response = await api.get('/persons', { params: filters });
      
      return response.data.data;
    } catch (error: any) {
      logger.error('Pipedrive getPersons error:', error.response?.data || error.message);
      throw new Error(`Failed to get Pipedrive persons: ${error.response?.data?.error || error.message}`);
    }
  }

  async getActivities(accessToken: string, filters?: any): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      const response = await api.get('/activities', { params: filters });
      
      return response.data.data;
    } catch (error: any) {
      logger.error('Pipedrive getActivities error:', error.response?.data || error.message);
      throw new Error(`Failed to get Pipedrive activities: ${error.response?.data?.error || error.message}`);
    }
  }

  async getStages(accessToken: string, pipelineId?: string): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      const params = pipelineId ? { pipeline_id: pipelineId } : {};
      const response = await api.get('/stages', { params });
      
      return response.data.data;
    } catch (error: any) {
      logger.error('Pipedrive getStages error:', error.response?.data || error.message);
      throw new Error(`Failed to get Pipedrive stages: ${error.response?.data?.error || error.message}`);
    }
  }

  async getPipelines(accessToken: string): Promise<any> {
    try {
      const api = this.getAxiosInstance(accessToken);
      const response = await api.get('/pipelines');
      
      return response.data.data;
    } catch (error: any) {
      logger.error('Pipedrive getPipelines error:', error.response?.data || error.message);
      throw new Error(`Failed to get Pipedrive pipelines: ${error.response?.data?.error || error.message}`);
    }
  }
}

export const pipedriveService = new PipedriveService();