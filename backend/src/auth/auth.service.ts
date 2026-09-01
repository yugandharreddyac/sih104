import { v4 as uuidv4 } from 'uuid';
import { PasswordService } from './password';
import { TokenService } from './jwt';
import { AuthUser, RoleName, ROLE_PERMISSIONS } from './types';
import { AuditService } from '../security/audit.service';
import { db } from '../database/db';

export class AuthService {
  // In-memory user store for deterministic testing & standalone local running
  private static users: Map<string, any> = new Map();

  public static async initializeDefaultUsers(): Promise<void> {
    const defaultPasswordHash = await PasswordService.hash('VoxShield@2026!');
    const defaultOrgId = '00000000-0000-0000-0000-000000000001';

    const seedUsers = [
      {
        id: '10000000-0000-0000-0000-000000000001',
        email: 'admin@voxshield.security',
        passwordHash: defaultPasswordHash,
        fullName: 'Lead Security Administrator',
        role: RoleName.ADMIN,
        organizationId: defaultOrgId,
        isActive: true,
      },
      {
        id: '10000000-0000-0000-0000-000000000002',
        email: 'analyst@voxshield.security',
        passwordHash: defaultPasswordHash,
        fullName: 'Tier-3 SOC Analyst',
        role: RoleName.SECURITY_ANALYST,
        organizationId: defaultOrgId,
        isActive: true,
      },
      {
        id: '10000000-0000-0000-0000-000000000003',
        email: 'supervisor@voxshield.security',
        passwordHash: defaultPasswordHash,
        fullName: 'Call Center Supervisor',
        role: RoleName.SUPERVISOR,
        organizationId: defaultOrgId,
        isActive: true,
      },
      {
        id: '10000000-0000-0000-0000-000000000004',
        email: 'operator@voxshield.security',
        passwordHash: defaultPasswordHash,
        fullName: 'Frontline Agent',
        role: RoleName.OPERATOR,
        organizationId: defaultOrgId,
        isActive: true,
      },
      {
        id: '10000000-0000-0000-0000-000000000005',
        email: 'viewer@voxshield.security',
        passwordHash: defaultPasswordHash,
        fullName: 'Compliance Auditor',
        role: RoleName.VIEWER,
        organizationId: defaultOrgId,
        isActive: true,
      },
    ];

    for (const u of seedUsers) {
      this.users.set(u.email.toLowerCase(), u);
    }
  }

  public static async login(
    email: string,
    pass: string,
    ip?: string,
    userAgent?: string
  ): Promise<{ token: string; user: AuthUser }> {
    if (this.users.size === 0) {
      await this.initializeDefaultUsers();
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = this.users.get(normalizedEmail);

    if (!user || !user.isActive) {
      await AuditService.record({
        organizationId: 'UNKNOWN_ORG',
        action: 'AUTH_LOGIN_FAILED',
        resourceType: 'USER',
        result: 'DENIED',
        ipAddress: ip,
        userAgent,
        metadata: { attemptedEmail: normalizedEmail },
      });
      throw new Error('Invalid email or password');
    }

    const isValidPassword = await PasswordService.compare(pass, user.passwordHash);
    if (!isValidPassword) {
      await AuditService.record({
        actorUserId: user.id,
        organizationId: user.organizationId,
        action: 'AUTH_LOGIN_FAILED_PASSWORD',
        resourceType: 'USER',
        resourceId: user.id,
        result: 'DENIED',
        ipAddress: ip,
        userAgent,
      });
      throw new Error('Invalid email or password');
    }

    const token = TokenService.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    });

    await AuditService.record({
      actorUserId: user.id,
      organizationId: user.organizationId,
      action: 'AUTH_LOGIN_SUCCESS',
      resourceType: 'USER',
      resourceId: user.id,
      result: 'SUCCESS',
      ipAddress: ip,
      userAgent,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        organizationId: user.organizationId,
        permissions: ROLE_PERMISSIONS[user.role as RoleName] || [],
      },
    };
  }

  public static async register(
    email: string,
    pass: string,
    fullName: string,
    role: RoleName,
    organizationId: string
  ): Promise<AuthUser> {
    if (this.users.size === 0) {
      await this.initializeDefaultUsers();
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (this.users.has(normalizedEmail)) {
      throw new Error('User with this email already exists');
    }

    const passwordHash = await PasswordService.hash(pass);
    const userId = uuidv4();

    const newUser = {
      id: userId,
      email: normalizedEmail,
      passwordHash,
      fullName,
      role,
      organizationId,
      isActive: true,
    };

    this.users.set(normalizedEmail, newUser);

    await AuditService.record({
      actorUserId: userId,
      organizationId,
      action: 'USER_REGISTERED',
      resourceType: 'USER',
      resourceId: userId,
      result: 'SUCCESS',
    });

    return {
      id: userId,
      email: normalizedEmail,
      fullName,
      role,
      organizationId,
      permissions: ROLE_PERMISSIONS[role] || [],
    };
  }
}
