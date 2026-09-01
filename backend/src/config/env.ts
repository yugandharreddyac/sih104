import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform((val) => parseInt(val, 10)).default('4000'),
  JWT_SECRET: z.string().min(16).default('voxshield_super_secure_jwt_secret_dev_key_2026!'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  DATABASE_URL: z.string().default('postgresql://voxshield_user:voxshield_secure_pass@localhost:5432/voxshield_db'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  AI_SERVICE_URL: z.string().default('http://localhost:8000'),
  ENCRYPTION_KEY: z.string().min(32).default('0123456789abcdef0123456789abcdef'), // 32 bytes for AES-256
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
