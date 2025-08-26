import axios from 'axios';
import { config } from '../config';
import { prisma } from '../config/database';
import { encrypt, decrypt } from '../utils/encryption';
import { AppError } from '../middleware/errorHandler';
import { OAuthTokens } from '../types';

export class OAuthService {
  private getOAuthConfig(provider: string) {
    const oauthConfigs = {
      retell: {
        clientId: config.oauth.retell.clientId,
        clientSecret: config.oauth.retell.clientSecret,
        authUrl: 'https://api.retellai.com/oauth/authorize',
        tokenUrl: 'https://api.retellai.com/oauth/token',
        scope: 'read write',
      },
      pipedrive: {
        clientId: config.oauth.pipedrive.clientId,
        clientSecret: config.oauth.pipedrive.clientSecret,
        authUrl: 'https://oauth.pipedrive.com/oauth/authorize',
        tokenUrl: 'https://oauth.pipedrive.com/oauth/token',
        scope: 'read write',
      },
      hubspot: {
        clientId: config.oauth.hubspot.clientId,
        clientSecret: config.oauth.hubspot.clientSecret,
        authUrl: 'https://app.hubspot.com/oauth/authorize',
        tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
        scope: 'contacts leads',
      },
      salesforce: {
        clientId: config.oauth.salesforce.clientId,
        clientSecret: config.oauth.salesforce.clientSecret,
        authUrl: 'https://login.salesforce.com/services/oauth2/authorize',
        tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
        scope: 'api refresh_token',
      },
      zoho: {
        clientId: config.oauth.zoho.clientId,
        clientSecret: config.oauth.zoho.clientSecret,
        authUrl: 'https://accounts.zoho.com/oauth/v2/auth',
        tokenUrl: 'https://accounts.zoho.com/oauth/v2/token',
        scope: 'ZohoCRM.modules.ALL',
      },
    };

    return oauthConfigs[provider as keyof typeof oauthConfigs];
  }

  generateAuthUrl(provider: string, userId: string, redirectUri: string): string {
    const oauthConfig = this.getOAuthConfig(provider);
    
    if (!oauthConfig) {
      throw new AppError(`Unsupported OAuth provider: ${provider}`, 400);
    }

    const params = new URLSearchParams({
      client_id: oauthConfig.clientId,
      response_type: 'code',
      scope: oauthConfig.scope,
      redirect_uri: redirectUri,
      state: Buffer.from(JSON.stringify({ userId, provider })).toString('base64'),
    });

    return `${oauthConfig.authUrl}?${params.toString()}`;
  }

  async exchangeCodeForTokens(
    provider: string,
    code: string,
    redirectUri: string,
    state: string
  ): Promise<{ userId: string; tokens: OAuthTokens; accountInfo: any }> {
    const oauthConfig = this.getOAuthConfig(provider);
    
    if (!oauthConfig) {
      throw new AppError(`Unsupported OAuth provider: ${provider}`, 400);
    }

    // Verify state parameter
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (error) {
      throw new AppError('Invalid state parameter', 400);
    }

    if (stateData.provider !== provider) {
      throw new AppError('State parameter mismatch', 400);
    }

    // Exchange code for tokens
    const tokenData = {
      grant_type: 'authorization_code',
      client_id: oauthConfig.clientId,
      client_secret: oauthConfig.clientSecret,
      code,
      redirect_uri: redirectUri,
    };

    const tokenResponse = await axios.post(oauthConfig.tokenUrl, 
      new URLSearchParams(tokenData).toString(), 
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const tokens: OAuthTokens = {
      accessToken: tokenResponse.data.access_token,
      refreshToken: tokenResponse.data.refresh_token,
      tokenType: tokenResponse.data.token_type || 'Bearer',
      expiresIn: tokenResponse.data.expires_in,
      scope: tokenResponse.data.scope,
    };

    // Get account information
    const accountInfo = await this.getAccountInfo(provider, tokens.accessToken);

    return {
      userId: stateData.userId,
      tokens,
      accountInfo,
    };
  }

  async getAccountInfo(provider: string, accessToken: string): Promise<any> {
    const accountEndpoints = {
      retell: 'https://api.retellai.com/v1/account',
      pipedrive: 'https://api.pipedrive.com/v1/users/me',
      hubspot: 'https://api.hubapi.com/integrations/v1/me',
      salesforce: 'https://login.salesforce.com/services/oauth2/userinfo',
      zoho: 'https://accounts.zoho.com/oauth/user/info',
    };

    const endpoint = accountEndpoints[provider as keyof typeof accountEndpoints];
    
    if (!endpoint) {
      throw new AppError(`No account endpoint for provider: ${provider}`, 400);
    }

    try {
      const response = await axios.get(endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      console.log(`Account info for ${provider}:`, response.data);
      return response.data;
    } catch (error: any) {
      console.error(`Failed to get account info for ${provider}:`, error.response?.data || error.message);
      // Return minimal info to prevent crashes
      return {
        id: 'unknown',
        name: 'Unknown User',
        email: 'unknown@example.com'
      };
    }
  }

  async saveAccount(
    userId: string,
    provider: string,
    tokens: OAuthTokens,
    accountInfo: any
  ): Promise<string> {
    const providerType = provider === 'retell' ? 'voice_ai' : 'crm';
    
    // Verify user exists in database
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError(`User not found: ${userId}`, 404);
    }

    // Encrypt sensitive tokens
    const encryptedAccessToken = encrypt(tokens.accessToken);
    const encryptedRefreshToken = tokens.refreshToken ? encrypt(tokens.refreshToken) : null;

    const expiresAt = tokens.expiresIn ? 
      new Date(Date.now() + tokens.expiresIn * 1000) : null;

    // Extract correct account identifier based on provider
    let providerAccountId: string;
    let accountName: string;
    let accountEmail: string;

    if (provider === 'pipedrive') {
      providerAccountId = String(accountInfo.data?.id || accountInfo.id || 'unknown');
      accountName = accountInfo.data?.name || accountInfo.name || 'Unknown User';
      accountEmail = accountInfo.data?.email || accountInfo.email || 'unknown@example.com';
    } else {
      providerAccountId = String(accountInfo.id || accountInfo.user_id || accountInfo.userId || 'unknown');
      accountName = accountInfo.name || accountInfo.company_name || 
                  `${accountInfo.first_name || ''} ${accountInfo.last_name || ''}`.trim() || 'Unknown User';
      accountEmail = accountInfo.email || 'unknown@example.com';
    }


    // Fetch CRM schema if this is a CRM provider
    let crmSchema = null;
    if (providerType === 'crm') {
      try {
        crmSchema = await this.fetchCRMSchema(provider, tokens.accessToken);
        console.log(`✅ Fetched CRM schema for ${provider} account: ${providerAccountId}`);
      } catch (error) {
        console.warn(`⚠️ Failed to fetch CRM schema for ${provider}:`, error);
        // Don't fail account creation if schema fetch fails
      }
    }

    // Check if account already exists for a different user (prevent ownership hijacking)
    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId,
        },
      },
      select: { userId: true, accountName: true, accountEmail: true },
    });

    if (existingAccount && existingAccount.userId !== userId) {
      throw new AppError(
        `This ${provider} account (${existingAccount.accountEmail}) is already connected to a different user. Each provider account can only be connected to one user at a time.`,
        409
      );
    }

    const account = await prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId,
        },
      },
      update: {
        // DO NOT update userId to prevent ownership hijacking
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenType: tokens.tokenType,
        scope: tokens.scope,
        expiresAt,
        accountName,
        accountEmail,
        lastSyncAt: new Date(),
        crmSchema: crmSchema,
      },
      create: {
        userId,
        provider,
        providerType,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenType: tokens.tokenType,
        scope: tokens.scope,
        expiresAt,
        providerAccountId,
        accountName,
        accountEmail,
        crmSchema: crmSchema,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'account_connected',
        resource: account.id,
        details: { provider, accountName: account.accountName },
      },
    });

    return account.id;
  }

  async refreshAccessToken(accountId: string): Promise<void> {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account || !account.refreshToken) {
      throw new AppError('Account not found or no refresh token available', 404);
    }

    const oauthConfig = this.getOAuthConfig(account.provider);
    
    if (!oauthConfig) {
      throw new AppError(`Unsupported OAuth provider: ${account.provider}`, 400);
    }

    const decryptedRefreshToken = decrypt(account.refreshToken);

    // Use URLSearchParams for proper form encoding
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('client_id', oauthConfig.clientId);
    params.append('client_secret', oauthConfig.clientSecret);
    params.append('refresh_token', decryptedRefreshToken);

    const tokenResponse = await axios.post(oauthConfig.tokenUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const newAccessToken = encrypt(tokenResponse.data.access_token);
    const newRefreshToken = tokenResponse.data.refresh_token ? 
      encrypt(tokenResponse.data.refresh_token) : account.refreshToken;
    const expiresAt = tokenResponse.data.expires_in ? 
      new Date(Date.now() + tokenResponse.data.expires_in * 1000) : null;

    await prisma.account.update({
      where: { id: accountId },
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresAt,
        lastSyncAt: new Date(),
      },
    });
  }

  async disconnectAccount(userId: string, accountId: string): Promise<void> {
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId },
    });

    if (!account) {
      throw new AppError('Account not found', 404);
    }

    // Check if account is used in any active integrations
    const activeIntegrations = await prisma.integration.count({
      where: {
        OR: [
          { retellAccountId: accountId },
          { crmAccountId: accountId },
        ],
        isActive: true,
      },
    });

    if (activeIntegrations > 0) {
      throw new AppError('Cannot disconnect account with active integrations', 400);
    }

    await prisma.account.delete({
      where: { id: accountId },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'account_disconnected',
        resource: accountId,
        details: { provider: account.provider, accountName: account.accountName },
      },
    });
  }

  async getDecryptedAccessToken(accountId: string): Promise<string> {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { accessToken: true, expiresAt: true },
    });

    if (!account || !account.accessToken) {
      throw new AppError('Account or access token not found', 404);
    }

    // Check if token is expired and refresh if needed
    if (account.expiresAt && account.expiresAt < new Date()) {
      await this.refreshAccessToken(accountId);
      
      const refreshedAccount = await prisma.account.findUnique({
        where: { id: accountId },
        select: { accessToken: true },
      });

      return decrypt(refreshedAccount!.accessToken!);
    }

    return decrypt(account.accessToken);
  }

  async fetchCRMSchema(provider: string, accessToken: string): Promise<any> {
    if (provider === 'pipedrive') {
      return this.fetchPipedriveSchema(accessToken);
    }
    
    throw new AppError(`Schema fetching not implemented for provider: ${provider}`, 400);
  }

  async fetchPipedriveSchema(accessToken: string): Promise<any> {
    try {
      const baseUrl = 'https://api.pipedrive.com/v1';
      const headers = { Authorization: `Bearer ${accessToken}` };

      const [stagesRes, pipelinesRes, dealFieldsRes, personFieldsRes, activityTypesRes, usersRes] = await Promise.all([
        axios.get(`${baseUrl}/stages`, { headers }),
        axios.get(`${baseUrl}/pipelines`, { headers }),
        axios.get(`${baseUrl}/dealFields`, { headers }),
        axios.get(`${baseUrl}/personFields`, { headers }),
        axios.get(`${baseUrl}/activityTypes`, { headers }),
        axios.get(`${baseUrl}/users`, { headers })
      ]);

      // Extract labels from custom fields (labels are "enum" or "set" type fields)
      const dealLabels = dealFieldsRes.data.data?.filter((field: any) => 
        ['enum', 'set'].includes(field.field_type) && field.options
      ).map((field: any) => ({
        field_id: field.id,
        field_key: field.key,
        field_name: field.name,
        field_type: field.field_type,
        options: field.options?.map((option: any) => ({
          id: option.id,
          label: option.label,
          color: option.color
        })) || []
      })) || [];

      const personLabels = personFieldsRes.data.data?.filter((field: any) => 
        ['enum', 'set'].includes(field.field_type) && field.options
      ).map((field: any) => ({
        field_id: field.id,
        field_key: field.key,
        field_name: field.name,
        field_type: field.field_type,
        options: field.options?.map((option: any) => ({
          id: option.id,
          label: option.label,
          color: option.color
        })) || []
      })) || [];

      return {
        stages: stagesRes.data.data?.map((stage: any) => ({
          id: stage.id,
          name: stage.name,
          pipeline_id: stage.pipeline_id,
          order_nr: stage.order_nr,
          deal_probability: stage.deal_probability
        })) || [],
        pipelines: pipelinesRes.data.data?.map((pipeline: any) => ({
          id: pipeline.id,
          name: pipeline.name,
          deal_probability: pipeline.deal_probability,
          order_nr: pipeline.order_nr,
          active: pipeline.active
        })) || [],
        dealFields: dealFieldsRes.data.data?.map((field: any) => ({
          id: field.id,
          key: field.key,
          name: field.name,
          field_type: field.field_type,
          options: field.options,
          mandatory_flag: field.mandatory_flag,
          add_time: field.add_time,
          update_time: field.update_time
        })) || [],
        personFields: personFieldsRes.data.data?.map((field: any) => ({
          id: field.id,
          key: field.key,
          name: field.name,
          field_type: field.field_type,
          options: field.options,
          mandatory_flag: field.mandatory_flag,
          add_time: field.add_time,
          update_time: field.update_time
        })) || [],
        activityTypes: activityTypesRes.data.data?.map((type: any) => ({
          id: type.id,
          name: type.name,
          key_string: type.key_string,
          icon_key: type.icon_key,
          active_flag: type.active_flag,
          is_custom_flag: type.is_custom_flag
        })) || [],
        users: usersRes.data.data?.map((user: any) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          active_flag: user.active_flag
        })) || [],
        dealLabels: dealLabels,
        personLabels: personLabels,
        fetchedAt: new Date().toISOString()
      };
    } catch (error: any) {
      console.error('Error fetching Pipedrive schema:', error.response?.data || error.message);
      throw new AppError('Failed to fetch Pipedrive schema data', 500);
    }
  }
}

export const oauthService = new OAuthService();