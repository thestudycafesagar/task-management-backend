/**
 * Auth Service
 * Business logic for authentication operations
 */
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import AuditLog from '../models/AuditLog.js';
import { generateToken, generateImpersonationToken } from '../utils/jwt.js';
import AppError from '../utils/appError.js';

export const authService = {
  /**
   * Create organization and admin user
   */
  async createOrganizationWithAdmin(data, ipInfo) {
    const { companyName, adminName, adminEmail, password } = data;

    // Check if email already exists
    const existingUser = await User.findOne({ email: adminEmail });
    if (existingUser) {
      throw new AppError('Email already registered.', 400);
    }

    // Create organization
    const organization = await Organization.create({
      name: companyName,
      isActive: true
    });

    // Create admin user
    const admin = await User.create({
      organizationId: organization._id,
      role: 'ADMIN',
      email: adminEmail,
      password,
      name: adminName
    });

    // Log audit
    await AuditLog.create({
      userId: admin._id,
      action: 'ORGANIZATION_CREATED',
      targetOrganizationId: organization._id,
      ipAddress: ipInfo.ip,
      userAgent: ipInfo.userAgent
    });

    const token = generateToken({ 
      userId: admin._id,
      role: admin.role,
      organizationId: organization._id
    });

    return {
      user: {
        _id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        organizationId: admin.organizationId
      },
      organization,
      redirectTo: `/${organization.slug}/dashboard`,
      token
    };
  },

  /**
   * Authenticate user and generate token
   */
  async authenticateUser(credentials) {
    const { email, password } = credentials;

    if (!email || !password) {
      throw new AppError('Please provide email and password.', 400);
    }

    // Find user and include password
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      throw new AppError('Invalid email or password.', 401);
    }

    if (!user.isActive) {
      throw new AppError('Your account has been deactivated.', 401);
    }

    // Check if organization is active (for non-super admin)
    if (user.role !== 'SUPER_ADMIN') {
      const organization = await Organization.findById(user.organizationId);
      if (!organization || !organization.isActive) {
        throw new AppError('Organization is not active.', 403);
      }
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    // Generate token
    const token = generateToken({
      userId: user._id,
      role: user.role,
      organizationId: user.organizationId
    });

    // Get organization slug
    let redirectTo = '/dashboard';
    let organization = null;
    
    if (user.role === 'SUPER_ADMIN') {
      redirectTo = '/super-admin';
    } else if (user.organizationId) {
      organization = await Organization.findById(user.organizationId);
      if (organization) {
        redirectTo = `/${organization.slug}/dashboard`;
      }
    }

    return {
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId || null
      },
      organization,
      redirectTo,
      token
    };
  },

  /**
   * Authenticate super admin
   */
  async authenticateSuperAdmin(credentials) {
    const { email, password } = credentials;

    if (!email || !password) {
      throw new AppError('Please provide email and password.', 400);
    }

    // Verify against environment variables
    const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'superadmin@platform.com';

    // Check email first
    if (email !== SUPER_ADMIN_EMAIL) {
      throw new AppError('Invalid super admin credentials.', 401);
    }

    // Find super admin user
    const superAdmin = await User.findOne({ 
      email: SUPER_ADMIN_EMAIL, 
      role: 'SUPER_ADMIN' 
    }).select('+password');

    if (!superAdmin) {
      throw new AppError('Super admin account not found. Please run initialization script.', 401);
    }

    // Verify password
    const isPasswordValid = await superAdmin.comparePassword(password);
    if (!isPasswordValid) {
      throw new AppError('Invalid super admin credentials.', 401);
    }

    if (!superAdmin.isActive) {
      throw new AppError('Super admin account has been deactivated.', 401);
    }

    // Update last login
    superAdmin.lastLogin = new Date();
    await superAdmin.save({ validateBeforeSave: false });

    // Generate token
    const token = generateToken({
      userId: superAdmin._id,
      role: superAdmin.role,
      organizationId: null
    });

    return {
      user: {
        _id: superAdmin._id,
        email: superAdmin.email,
        name: superAdmin.name,
        role: superAdmin.role,
        organizationId: null
      },
      organization: null,
      redirectTo: '/super-admin',
      token
    };
  },

  /**
   * Get current user with organization
   */
  async getCurrentUserData(userId, organizationId, isImpersonating, userRole) {
    const user = await User.findById(userId);
    let organization = null;

    if (organizationId) {
      organization = await Organization.findById(organizationId);
    }

    const hasAdminPrivileges = userRole === 'ADMIN' || 
                               userRole === 'SUPER_ADMIN' ||
                               (isImpersonating && userRole === 'SUPER_ADMIN');

    const token = isImpersonating 
      ? generateImpersonationToken(userId, organizationId)
      : generateToken({ userId: userId.toString() });

    return {
      user,
      organization,
      isImpersonating: isImpersonating || false,
      hasAdminPrivileges,
      token
    };
  },

  /**
   * Start organization impersonation
   */
  async startImpersonation(superAdminId, organizationId, ipInfo) {
    // Verify organization exists
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new AppError('Organization not found.', 404);
    }

    // Log audit
    await AuditLog.create({
      userId: superAdminId,
      action: 'IMPERSONATION_START',
      targetOrganizationId: organization._id,
      ipAddress: ipInfo.ip,
      userAgent: ipInfo.userAgent
    });

    // Generate impersonation token
    const token = generateImpersonationToken(superAdminId, organization._id);

    return {
      organization,
      redirectTo: `/${organization.slug}`,
      token
    };
  },

  /**
   * End organization impersonation
   */
  async endImpersonation(superAdminId, organizationId, ipInfo, userRole) {
    // Log audit
    await AuditLog.create({
      userId: superAdminId,
      action: 'IMPERSONATION_END',
      targetOrganizationId: organizationId,
      ipAddress: ipInfo.ip,
      userAgent: ipInfo.userAgent
    });

    // Generate regular super admin token
    const token = generateToken({
      userId: superAdminId,
      role: userRole
    });

    return {
      redirectTo: '/super-admin',
      token
    };
  },

  /**
   * Update FCM token for user
   */
  async updateFCMToken(userId, fcmToken) {
    if (!fcmToken) {
      throw new AppError('FCM token is required.', 400);
    }

    const user = await User.findById(userId);
    
    // Add token if not already present
    if (!user.fcmTokens.includes(fcmToken)) {
      user.fcmTokens.push(fcmToken);
      await user.save({ validateBeforeSave: false });
    }

    return { message: 'FCM token updated' };
  },
};
