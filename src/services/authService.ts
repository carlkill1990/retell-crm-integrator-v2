import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { config } from '../config';
import { hashPassword, comparePassword } from '../utils/encryption';
import { AppError } from '../middleware/errorHandler';
import { User } from '../types';

export class AuthService {
  async register(userData: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) {
    const existingUser = await prisma.user.findUnique({
      where: { email: userData.email },
    });

    if (existingUser) {
      throw new AppError('User already exists with this email', 400);
    }

    const hashedPassword = await hashPassword(userData.password);

    const user = await prisma.user.create({
      data: {
        email: userData.email,
        password: hashedPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days trial
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        createdAt: true,
      },
    });

    const tokens = this.generateTokens(user.id, user.email);

    await this.createAuditLog(user.id, 'user_registered', undefined, {
      email: user.email,
    });

    return { user, ...tokens };
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        firstName: true,
        lastName: true,
        subscriptionTier: true,
        subscriptionStatus: true,
      },
    });

    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      throw new AppError('Invalid email or password', 401);
    }

    const tokens = this.generateTokens(user.id, user.email);

    await this.createAuditLog(user.id, 'user_login');

    const { password: _, ...userWithoutPassword } = user;

    return { user: userWithoutPassword, ...tokens };
  }

  async refreshToken(refreshToken: string) {
    try {
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as {
        userId: string;
        email: string;
      };

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          subscriptionTier: true,
          subscriptionStatus: true,
        },
      });

      if (!user) {
        throw new AppError('User not found', 401);
      }

      const tokens = this.generateTokens(user.id, user.email);

      return { user, ...tokens };
    } catch (error) {
      throw new AppError('Invalid refresh token', 401);
    }
  }

  async logout(userId: string) {
    await this.createAuditLog(userId, 'user_logout');
    // In a production app, you might want to blacklist the token
    return { success: true };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const isCurrentPasswordValid = await comparePassword(
      currentPassword,
      user.password
    );

    if (!isCurrentPasswordValid) {
      throw new AppError('Current password is incorrect', 400);
    }

    const hashedNewPassword = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    await this.createAuditLog(userId, 'password_changed');

    return { success: true };
  }

  async requestPasswordReset(email: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true },
    });

    if (!user) {
      // Don't reveal if user exists or not
      return { success: true };
    }

    const resetToken = jwt.sign(
      { userId: user.id, email: user.email },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    // In a production app, you would send this token via email
    await this.createAuditLog(user.id, 'password_reset_requested');

    return { success: true, resetToken }; // Remove resetToken in production
  }

  async resetPassword(resetToken: string, newPassword: string) {
    try {
      const decoded = jwt.verify(resetToken, config.jwt.secret) as {
        userId: string;
        email: string;
      };

      const hashedPassword = await hashPassword(newPassword);

      await prisma.user.update({
        where: { id: decoded.userId },
        data: { password: hashedPassword },
      });

      await this.createAuditLog(decoded.userId, 'password_reset_completed');

      return { success: true };
    } catch (error) {
      throw new AppError('Invalid or expired reset token', 400);
    }
  }

  private generateTokens(userId: string, email: string) {
    const accessToken = (jwt as any).sign(
      { userId, email },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    const refreshToken = (jwt as any).sign(
      { userId, email },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn }
    );

    return { accessToken, refreshToken };
  }

  private async createAuditLog(
    userId: string,
    action: string,
    resource?: string,
    details?: any
  ) {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        details,
      },
    });
  }
}

export const authService = new AuthService();