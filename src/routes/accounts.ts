import { Router } from 'express';
import { prisma } from '../config/database';
import { oauthService } from '../services/oauthService';
import { catchAsync, AppError } from '../middleware/errorHandler';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get(
  '/',
  catchAsync(async (req, res) => {
    const accounts = await prisma.account.findMany({
      where: { userId: req.user!.id },
      select: {
        id: true,
        provider: true,
        providerType: true,
        accountName: true,
        accountEmail: true,
        accessToken: true, // Include access token for auto-population
        isActive: true,
        lastSyncAt: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: accounts,
    });
  })
);

// OAuth routes (no auth required)
const oauthRouter = Router();

oauthRouter.get(
  '/:provider/auth-url',
  catchAsync(async (req, res) => {
    const { provider } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required as query parameter'
      });
    }
    
    // Use fixed HTTPS redirect URL for OAuth (required for live Pipedrive apps)
    const oauthBaseUrl = process.env.OAUTH_REDIRECT_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${oauthBaseUrl}/api/accounts/oauth/${provider}/callback`;

    const authUrl = oauthService.generateAuthUrl(
      provider,
      userId as string,
      redirectUri
    );

    res.json({
      success: true,
      data: { authUrl },
    });
  })
);

oauthRouter.get(
  '/:provider/callback',
  catchAsync(async (req, res) => {
    const { provider } = req.params;
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${process.env.FRONTEND_URL}/accounts?error=${encodeURIComponent(error as string)}`);
    }

    if (!code || !state) {
      return res.redirect(`${process.env.FRONTEND_URL}/accounts?error=missing_code_or_state`);
    }

    try {
      // Use fixed HTTPS redirect URL for OAuth (required for live Pipedrive apps)
    const oauthBaseUrl = process.env.OAUTH_REDIRECT_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${oauthBaseUrl}/api/accounts/oauth/${provider}/callback`;

      const { userId, tokens, accountInfo } = await oauthService.exchangeCodeForTokens(
        provider,
        code as string,
        redirectUri,
        state as string
      );

      const accountId = await oauthService.saveAccount(
        userId,
        provider,
        tokens,
        accountInfo
      );

      res.redirect(`${process.env.FRONTEND_URL}/integrations/new?success=account_connected&provider=${provider}&accountId=${accountId}`);
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL}/integrations/new?error=connection_failed`);
    }
  })
);

router.post(
  '/:accountId/refresh',
  catchAsync(async (req, res) => {
    const { accountId } = req.params;

    // Verify account belongs to user
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId: req.user!.id },
    });

    if (!account) {
      throw new AppError('Account not found', 404);
    }

    await oauthService.refreshAccessToken(accountId);

    res.json({
      success: true,
      message: 'Access token refreshed successfully',
    });
  })
);

router.delete(
  '/:accountId',
  catchAsync(async (req, res) => {
    const { accountId } = req.params;

    await oauthService.disconnectAccount(req.user!.id, accountId);

    res.json({
      success: true,
      message: 'Account disconnected successfully',
    });
  })
);

router.get(
  '/:accountId/test',
  catchAsync(async (req, res) => {
    const { accountId } = req.params;

    // Verify account belongs to user
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId: req.user!.id },
    });

    if (!account) {
      throw new AppError('Account not found', 404);
    }

    try {
      const accessToken = await oauthService.getDecryptedAccessToken(accountId);
      const accountInfo = await oauthService.getAccountInfo(account.provider, accessToken);

      res.json({
        success: true,
        data: {
          connected: true,
          accountInfo,
          lastTested: new Date(),
        },
        message: 'Account connection test successful',
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Account connection test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

router.get(
  '/providers',
  catchAsync(async (req, res) => {
    const providers = [
      {
        id: 'retell',
        name: 'Retell AI',
        type: 'voice_ai',
        description: 'Voice AI platform for automated calls',
        icon: 'retell-icon.svg',
        isActive: !!process.env.RETELL_CLIENT_ID,
      },
      {
        id: 'pipedrive',
        name: 'Pipedrive',
        type: 'crm',
        description: 'Sales CRM and pipeline management',
        icon: 'pipedrive-icon.svg',
        isActive: !!process.env.PIPEDRIVE_CLIENT_ID,
      },
      {
        id: 'hubspot',
        name: 'HubSpot',
        type: 'crm',
        description: 'All-in-one marketing, sales, and service platform',
        icon: 'hubspot-icon.svg',
        isActive: !!process.env.HUBSPOT_CLIENT_ID,
      },
      {
        id: 'salesforce',
        name: 'Salesforce',
        type: 'crm',
        description: 'World\'s leading CRM platform',
        icon: 'salesforce-icon.svg',
        isActive: !!process.env.SALESFORCE_CLIENT_ID,
      },
      {
        id: 'zoho',
        name: 'Zoho CRM',
        type: 'crm',
        description: 'Complete CRM solution for businesses',
        icon: 'zoho-icon.svg',
        isActive: !!process.env.ZOHO_CLIENT_ID,
      },
    ];

    res.json({
      success: true,
      data: providers,
    });
  })
);

// Simple account creation for API key-based providers
router.post(
  '/simple',
  catchAsync(async (req, res) => {
    const { provider, providerType, accountName, apiKey } = req.body;
    const userId = req.user!.id;

    if (!provider || !providerType || !apiKey) {
      throw new AppError('Provider, providerType, and apiKey are required', 400);
    }

    try {
      // Check if account already exists for this user and provider
      const existingAccount = await prisma.account.findFirst({
        where: {
          userId,
          provider,
          providerType
        }
      });

      if (existingAccount) {
        // Update existing account
        const updatedAccount = await prisma.account.update({
          where: { id: existingAccount.id },
          data: {
            accountName: accountName || existingAccount.accountName,
            // Store API key in accessToken field (it's already a text field)
            accessToken: apiKey,
            isActive: true,
            lastSyncAt: new Date(),
          }
        });

        return res.json({
          success: true,
          data: updatedAccount,
          message: 'Account updated successfully'
        });
      }

      // Create new account
      const account = await prisma.account.create({
        data: {
          userId,
          provider,
          providerType,
          accountName: accountName || `${provider} Account`,
          accessToken: apiKey, // Store API key here
          providerAccountId: `${provider}_${Date.now()}`, // Simple unique ID
          isActive: true,
          lastSyncAt: new Date(),
        }
      });

      res.json({
        success: true,
        data: account,
        message: 'Account created successfully'
      });
    } catch (error) {
      console.error('Failed to create simple account:', error);
      throw new AppError('Failed to create account', 500);
    }
  })
);

export default router;
export { oauthRouter };