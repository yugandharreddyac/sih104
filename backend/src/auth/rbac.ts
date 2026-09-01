import { Request, Response, NextFunction } from 'express';
import { TokenService } from './jwt';
import { AuthUser, Permission, RoleName, ROLE_PERMISSIONS } from './types';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      correlationId?: string;
    }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'AUTHENTICATION_REQUIRED',
      message: 'Authorization header with Bearer token is missing or malformed',
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = TokenService.verifyToken(token);
    const permissions = ROLE_PERMISSIONS[payload.role] || [];

    req.user = {
      id: payload.userId,
      email: payload.email,
      fullName: 'SOC Operator',
      role: payload.role,
      organizationId: payload.organizationId,
      permissions,
    };
    next();
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: error.message,
    });
  }
};

export const requireRole = (allowedRoles: RoleName[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'You must be authenticated to access this resource',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'FORBIDDEN_ROLE',
        message: `Role ${req.user.role} does not have sufficient privileges for this endpoint`,
      });
      return;
    }
    next();
  };
};

export const requirePermission = (requiredPermission: Permission) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
      return;
    }

    const hasPermission =
      req.user.permissions.includes(Permission.ALL) ||
      req.user.permissions.includes(requiredPermission);

    if (!hasPermission) {
      res.status(403).json({
        success: false,
        error: 'PERMISSION_DENIED',
        message: `Required permission '${requiredPermission}' is missing`,
      });
      return;
    }
    next();
  };
};
