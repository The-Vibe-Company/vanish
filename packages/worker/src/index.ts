import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import uploadRoutes from './routes/upload.js';
import serveRoutes from './routes/serve.js';
import authRoutes from './routes/auth.js';
import keysRoutes from './routes/keys.js';
import userRoutes from './routes/user.js';
import billingRoutes from './routes/billing.js';
import landingRoutes from './routes/landing.js';
import dashboardRoutes from './routes/dashboard.js';
import siteRoutes from './routes/sites.js';
import { handleCleanup } from './cron/cleanup.js';

const app = new Hono<{ Bindings: Env }>();

// CORS for all routes
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type', 'X-Filename', 'X-Expires-Days', 'X-Site-Token'],
}));

// Auth middleware for all routes
app.use('*', authMiddleware);

// Rate limit upload endpoint
app.use('/upload', rateLimitMiddleware);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', version: '0.1.0' }));

// Sites need to run before the landing page so *.vanish.sh can serve /.
app.route('/', siteRoutes);

// Dashboard
app.route('/', dashboardRoutes);

// Landing page
app.route('/', landingRoutes);

// Routes
app.route('/', uploadRoutes);
app.route('/', serveRoutes);
app.route('/', authRoutes);
app.route('/', keysRoutes);
app.route('/', userRoutes);
app.route('/', billingRoutes);

// 404 fallback
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default {
  fetch: app.fetch,

  // Cron trigger handler
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleCleanup(env));
  },
};
