import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { JWTPayload } from './types';

export class TokenService {
  public static generateToken(payload: JWTPayload): string {
    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as any,
    });
  }

  public static verifyToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, env.JWT_SECRET) as JWTPayload;
    } catch (error: any) {
      throw new Error(`Invalid or expired token: ${error.message}`);
    }
  }
}
