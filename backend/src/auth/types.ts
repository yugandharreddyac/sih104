export enum RoleName {
  ADMIN = 'ADMIN',
  SECURITY_ANALYST = 'SECURITY_ANALYST',
  SUPERVISOR = 'SUPERVISOR',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER',
}

export enum Permission {
  // Call Operations
  CALLS_READ = 'calls:read',
  CALLS_STREAM = 'calls:stream',
  CALLS_INTERVENE = 'calls:intervene',
  CALLS_TERMINATE = 'calls:terminate',

  // Incidents
  INCIDENTS_READ = 'incidents:read',
  INCIDENTS_WRITE = 'incidents:write',
  INCIDENTS_RESOLVE = 'incidents:resolve',

  // Policies
  POLICIES_READ = 'policies:read',
  POLICIES_WRITE = 'policies:write',

  // Verifications
  VERIFICATION_TRIGGER = 'verification:trigger',
  VERIFICATION_OVERRIDE = 'verification:override',

  // Audits & Administration
  AUDIT_READ = 'audit:read',
  SYSTEM_CONFIG = 'system:config',
  USER_MANAGE = 'user:manage',
  ALL = '*',
}

export const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  [RoleName.ADMIN]: [Permission.ALL],
  [RoleName.SECURITY_ANALYST]: [
    Permission.CALLS_READ,
    Permission.CALLS_STREAM,
    Permission.CALLS_INTERVENE,
    Permission.INCIDENTS_READ,
    Permission.INCIDENTS_WRITE,
    Permission.INCIDENTS_RESOLVE,
    Permission.POLICIES_READ,
    Permission.VERIFICATION_TRIGGER,
    Permission.AUDIT_READ,
  ],
  [RoleName.SUPERVISOR]: [
    Permission.CALLS_READ,
    Permission.CALLS_STREAM,
    Permission.CALLS_INTERVENE,
    Permission.INCIDENTS_READ,
    Permission.VERIFICATION_TRIGGER,
    Permission.VERIFICATION_OVERRIDE,
  ],
  [RoleName.OPERATOR]: [
    Permission.CALLS_READ,
    Permission.CALLS_STREAM,
    Permission.VERIFICATION_TRIGGER,
  ],
  [RoleName.VIEWER]: [
    Permission.CALLS_READ,
    Permission.INCIDENTS_READ,
    Permission.AUDIT_READ,
  ],
};

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: RoleName;
  organizationId: string;
  permissions: Permission[];
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: RoleName;
  organizationId: string;
}
