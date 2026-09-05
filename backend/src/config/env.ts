import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform((val) => parseInt(val, 10)).default('4000'),
  JWT_SECRET: isProd ? z.string().min(16).refine(val => val !== 'voxshield_super_secure_jwt_secret_dev_key_2026!', { message: "Cannot use default JWT_SECRET in production" }) : z.string().min(16).default('voxshield_super_secure_jwt_secret_dev_key_2026!'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  DATABASE_URL: z.string().default('postgresql://voxshield_user:voxshield_secure_pass@localhost:5432/voxshield_db'),
  PERSISTENCE_MODE: isProd ? z.enum(['strict', 'fallback']).default('strict') : z.enum(['strict', 'fallback']).default('fallback'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  AI_SERVICE_URL: z.string().default('http://localhost:8000'),
  ENCRYPTION_KEY: isProd ? z.string().min(32).refine(val => val !== '0123456789abcdef0123456789abcdef', { message: "Cannot use default ENCRYPTION_KEY in production" }) : z.string().min(32).default('0123456789abcdef0123456789abcdef'), // 32 bytes for AES-256
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  RTP_UDP_HOST: z.string().default('0.0.0.0'),
  RTP_UDP_PORT: z.string().transform((val) => parseInt(val, 10)).default('10000'),
  INTERVENTION_WEBHOOK_URL: z.string().optional(),
  WEBHOOK_SECRET: isProd ? z.string().min(16).refine(val => val !== 'voxshield_default_dev_webhook_secret_2026', { message: "Cannot use default WEBHOOK_SECRET in production" }) : z.string().min(16).default('voxshield_default_dev_webhook_secret_2026'),
  TELEPHONY_ENABLED: z.string().transform((val) => val === 'true' || val === '1').default('true'),
});


const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;

export function isStrictMode(): boolean {
  return env.PERSISTENCE_MODE === 'strict';
}
