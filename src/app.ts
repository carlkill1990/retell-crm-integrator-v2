import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { logger } from './config/logger';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';

import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import accountRoutes, { oauthRouter } from './routes/accounts';
import integrationRoutes from './routes/integrations';
import webhookRoutes from './routes/webhooks';
import webhookTestRoutes from './routes/webhookTest';
import syncRoutes from './routes/sync';
import billingRoutes from './routes/billing';
import crmSchemaRoutes from './routes/crmSchema';
import adminRoutes from './routes/admin';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Rate limiting (disabled in development)
if (config.nodeEnv === 'production') {
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', limiter);
}

// CORS
app.use(cors({
  origin: [config.frontendUrl, 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/user', authMiddleware, userRoutes);
// OAuth callback routes (no auth required for callbacks from external services)
app.use('/api/accounts/oauth', oauthRouter);
// All other account endpoints require authentication
app.use('/api/accounts', authMiddleware, accountRoutes);
app.use('/api/integrations', authMiddleware, integrationRoutes);
app.use('/api/webhooks', webhookRoutes); // No auth needed for webhooks  
app.use('/api/test', webhookTestRoutes); // Test endpoints
app.use('/api/sync', authMiddleware, syncRoutes);
app.use('/api/billing', authMiddleware, billingRoutes);
app.use('/api/crm', authMiddleware, crmSchemaRoutes);
app.use('/api/admin', adminRoutes); // Admin routes for webhook management

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Error handling middleware
app.use(errorHandler);

export default app;