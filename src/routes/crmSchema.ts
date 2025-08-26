import express from 'express';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';

const router = express.Router();

// Get CRM schema for a connected account
router.get('/:accountId/schema', authMiddleware, async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    // Verify the account belongs to the user
    const account = await prisma.account.findFirst({
      where: {
        id: accountId,
        userId: userId,
        providerType: 'crm' // Only CRM accounts have schemas
      },
      select: {
        id: true,
        provider: true,
        crmSchema: true,
        accountName: true,
        isActive: true
      }
    });

    if (!account) {
      throw new AppError('CRM account not found', 404);
    }

    if (!account.isActive) {
      throw new AppError('CRM account is not active', 400);
    }

    // Return the stored schema or empty structure if none exists
    const schema = account.crmSchema || {
      stages: [],
      pipelines: [],
      dealFields: [],
      personFields: [],
      activityTypes: [],
      fetchedAt: null
    };

    res.json({
      success: true,
      data: {
        accountId: account.id,
        provider: account.provider,
        accountName: account.accountName,
        schema: schema
      }
    });

  } catch (error: any) {
    console.error('Error fetching CRM schema:', error);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch CRM schema'
    });
  }
});

// Refresh CRM schema for an account (manual refresh)
router.post('/:accountId/schema/refresh', authMiddleware, async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    // Verify the account belongs to the user and get access token
    const account = await prisma.account.findFirst({
      where: {
        id: accountId,
        userId: userId,
        providerType: 'crm'
      },
      select: {
        id: true,
        provider: true,
        accessToken: true,
        isActive: true
      }
    });

    if (!account) {
      throw new AppError('CRM account not found', 404);
    }

    if (!account.isActive) {
      throw new AppError('CRM account is not active', 400);
    }

    if (!account.accessToken) {
      throw new AppError('No access token available for this account', 400);
    }

    // Import the OAuth service to fetch fresh schema
    const { oauthService } = await import('../services/oauthService');
    const decryptedToken = await oauthService.getDecryptedAccessToken(accountId);
    
    // Fetch fresh schema
    const freshSchema = await oauthService.fetchCRMSchema(account.provider, decryptedToken);

    // Update the account with fresh schema
    await prisma.account.update({
      where: { id: accountId },
      data: { 
        crmSchema: freshSchema,
        lastSyncAt: new Date()
      }
    });

    res.json({
      success: true,
      message: 'CRM schema refreshed successfully',
      data: {
        accountId: account.id,
        provider: account.provider,
        schema: freshSchema
      }
    });

  } catch (error: any) {
    console.error('Error refreshing CRM schema:', error);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to refresh CRM schema'
    });
  }
});

export default router;