import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { RoleName } from './types';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  role: z.nativeEnum(RoleName),
  organizationId: z.string().uuid().optional().default('00000000-0000-0000-0000-000000000001'),
});

export class AuthController {
  public static async login(req: Request, res: Response): Promise<void> {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        details: parseResult.error.format(),
      });
      return;
    }

    try {
      const { email, password } = parseResult.data;
      const result = await AuthService.login(
        email,
        password,
        req.ip,
        req.headers['user-agent']
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_FAILED',
        message: error.message,
      });
    }
  }

  public static async register(req: Request, res: Response): Promise<void> {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        details: parseResult.error.format(),
      });
      return;
    }

    try {
      const { email, password, fullName, role, organizationId } = parseResult.data;
      const user = await AuthService.register(email, password, fullName, role, organizationId);

      res.status(201).json({
        success: true,
        data: user,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'REGISTRATION_FAILED',
        message: error.message,
      });
    }
  }

  public static async getProfile(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      data: req.user,
    });
  }
}
