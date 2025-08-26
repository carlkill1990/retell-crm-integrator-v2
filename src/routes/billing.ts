import { Router } from 'express';
import { catchAsync } from '../middleware/errorHandler';

const router = Router();

router.get(
  '/plans',
  catchAsync(async (req, res) => {
    const plans = [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        interval: 'month',
        features: [
          '1 integration',
          '100 syncs per month',
          'Email support',
          'Basic analytics',
        ],
        limits: {
          integrations: 1,
          syncsPerMonth: 100,
        },
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 29,
        interval: 'month',
        features: [
          '10 integrations',
          '5,000 syncs per month',
          'Priority support',
          'Advanced analytics',
          'Custom field mappings',
        ],
        limits: {
          integrations: 10,
          syncsPerMonth: 5000,
        },
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: 99,
        interval: 'month',
        features: [
          'Unlimited integrations',
          'Unlimited syncs',
          'Premium support',
          'Custom webhooks',
          'SSO integration',
          'API access',
        ],
        limits: {
          integrations: -1, // unlimited
          syncsPerMonth: -1, // unlimited
        },
      },
    ];

    res.json({
      success: true,
      data: plans,
    });
  })
);

router.get(
  '/usage',
  catchAsync(async (req, res) => {
    const userId = req.user!.id;
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const [syncCount, integrationCount] = await Promise.all([
      require('../config/database').prisma.syncEvent.count({
        where: {
          userId,
          createdAt: { gte: currentMonth },
        },
      }),
      require('../config/database').prisma.integration.count({
        where: { userId },
      }),
    ]);

    const user = await require('../config/database').prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionTier: true,
        subscriptionStatus: true,
        trialEndsAt: true,
      },
    });

    const usage = {
      syncsThisMonth: syncCount,
      totalIntegrations: integrationCount,
      subscriptionTier: user?.subscriptionTier || 'free',
      subscriptionStatus: user?.subscriptionStatus || 'active',
      trialEndsAt: user?.trialEndsAt,
    };

    res.json({
      success: true,
      data: usage,
    });
  })
);

export default router;