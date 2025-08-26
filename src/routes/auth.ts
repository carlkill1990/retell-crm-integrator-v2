import { Router } from 'express';
import { authService } from '../services/authService';
import { oauthService } from '../services/oauthService';
import { catchAsync } from '../middleware/errorHandler';
import { validateRequest } from '../utils/validation';
import {
  userRegistrationSchema,
  userLoginSchema,
} from '../utils/validation';

const router = Router();

router.post(
  '/register',
  validateRequest(userRegistrationSchema),
  catchAsync(async (req, res) => {
    const result = await authService.register(req.body);

    res.status(201).json({
      success: true,
      data: result,
      message: 'User registered successfully',
    });
  })
);

router.post(
  '/login',
  validateRequest(userLoginSchema),
  catchAsync(async (req, res) => {
    const { email, password } = req.body;
    const result = await authService.login(email, password);

    res.json({
      success: true,
      data: result,
      message: 'Login successful',
    });
  })
);

router.post(
  '/refresh',
  catchAsync(async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required',
      });
    }

    const result = await authService.refreshToken(refreshToken);

    res.json({
      success: true,
      data: result,
      message: 'Token refreshed successfully',
    });
  })
);

router.post(
  '/logout',
  catchAsync(async (req, res) => {
    const { userId } = req.body;

    if (userId) {
      await authService.logout(userId);
    }

    res.json({
      success: true,
      message: 'Logout successful',
    });
  })
);

router.post(
  '/change-password',
  catchAsync(async (req, res) => {
    const { userId, currentPassword, newPassword } = req.body;

    if (!userId || !currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
      });
    }

    await authService.changePassword(userId, currentPassword, newPassword);

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  })
);

router.post(
  '/forgot-password',
  catchAsync(async (req, res) => {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
      });
    }

    const result = await authService.requestPasswordReset(email);

    res.json({
      success: true,
      message: 'Password reset email sent if account exists',
    });
  })
);

router.post(
  '/reset-password',
  catchAsync(async (req, res) => {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Reset token and new password are required',
      });
    }

    await authService.resetPassword(resetToken, newPassword);

    res.json({
      success: true,
      message: 'Password reset successfully',
    });
  })
);

router.get(
  '/oauth/:provider/authorize',
  catchAsync(async (req, res) => {
    const { provider } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
    }

    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/oauth/${provider}/callback`;
    const authUrl = oauthService.generateAuthUrl(provider, user_id as string, redirectUri);

    res.json({
      success: true,
      data: { authUrl },
    });
  })
);

router.get(
  '/oauth/:provider/callback',
  catchAsync(async (req, res) => {
    const { provider } = req.params;
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code and state are required',
      });
    }

    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/oauth/${provider}/callback`;
    const result = await oauthService.exchangeCodeForTokens(
      provider,
      code as string,
      redirectUri,
      state as string
    );

    const accountId = await oauthService.saveAccount(
      result.userId,
      provider,
      result.tokens,
      result.accountInfo
    );

    res.redirect(`${process.env.FRONTEND_URL}/integrations/new?connected=${provider}&account_id=${accountId}`);
  })
);

router.post(
  '/oauth/:provider/disconnect',
  catchAsync(async (req, res) => {
    const { provider } = req.params;
    const { user_id, account_id } = req.body;

    if (!user_id || !account_id) {
      return res.status(400).json({
        success: false,
        error: 'User ID and account ID are required',
      });
    }

    await oauthService.disconnectAccount(user_id, account_id);

    res.json({
      success: true,
      message: `${provider} account disconnected successfully`,
    });
  })
);

export default router;