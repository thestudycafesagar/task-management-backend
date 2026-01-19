import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/appError.js';
import { generateToken, generateImpersonationToken } from '../utils/jwt.js';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import AuditLog from '../models/AuditLog.js';
import bcrypt from 'bcryptjs';

/**
 * Company self-signup - Creates organization and admin user
 */
export const companySignup = asyncHandler(async (req, res, next) => {
  const { companyName, adminName, adminEmail, password } = req.body;

  // Check if email already exists
  const existingUser = await User.findOne({ email: adminEmail });
  if (existingUser) {
    return next(new AppError('Email already registered.', 400));
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
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  // Generate JWT token
  const token = generateToken({ 
    userId: admin._id,
    role: admin.role,
    organizationId: organization._id
  });

  // Set cookie with proper configuration for cross-origin
  const cookieOptions = {
    expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: true, // Always true for cookies to work in incognito
    sameSite: 'none', // Required for cross-origin cookies
    path: '/'
  };

  res.cookie('token', token, cookieOptions);

  res.status(201).json({
    status: 'success',
    data: {
      user: {
        _id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        organizationId: admin.organizationId
      },
      organization,
      redirectTo: `/${organization.slug}/dashboard`
    }
  });
});

/**
 * Login - Authenticate user
 */
export const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Please provide email and password.', 400));
  }

  // Find user and include password
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    return next(new AppError('Invalid email or password.', 401));
  }

  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated.', 401));
  }

  // Check if organization is active (for non-super admin)
  if (user.role !== 'SUPER_ADMIN') {
    const organization = await Organization.findById(user.organizationId);
    if (!organization || !organization.isActive) {
      return next(new AppError('Organization is not active.', 403));
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

  // Set cookie with proper configuration for cross-origin
  const cookieOptions = {
    expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: true, // Always true for cookies to work in incognito
    sameSite: 'none', // Required for cross-origin cookies
    path: '/'
  };

  res.cookie('token', token, cookieOptions);

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

  res.status(200).json({
    status: 'success',
    data: {
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId || null
      },
      organization,
      redirectTo
    }
  });
});

/**
 * Super Admin Login - Hardcoded credentials from environment
 */
export const superAdminLogin = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Please provide email and password.', 400));
  }

  // Verify against environment variables
  const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'superadmin@platform.com';
  const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@123';

  // Check email first
  if (email !== SUPER_ADMIN_EMAIL) {
    return next(new AppError('Invalid super admin credentials.', 401));
  }

  // Find super admin user
  const superAdmin = await User.findOne({ email: SUPER_ADMIN_EMAIL, role: 'SUPER_ADMIN' }).select('+password');

  if (!superAdmin) {
    return next(new AppError('Super admin account not found. Please run initialization script.', 401));
  }

  // Verify password
  const isPasswordValid = await superAdmin.comparePassword(password);
  if (!isPasswordValid) {
    return next(new AppError('Invalid super admin credentials.', 401));
  }

  if (!superAdmin.isActive) {
    return next(new AppError('Super admin account has been deactivated.', 401));
  }

  // Update last login
  superAdmin.lastLogin = new Date();
  await superAdmin.save({ validateBeforeSave: false });

  // Generate token
  const token = generateToken({
    userId: superAdmin._id,
    role: superAdmin.role,
    organizationId: null // Super admin has no organization
  });

  // Set cookie with proper configuration for cross-origin
  const cookieOptions = {
    expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/'
  };

  res.cookie('token', token, cookieOptions);

  res.status(200).json({
    status: 'success',
    data: {
      user: {
        _id: superAdmin._id,
        email: superAdmin.email,
        name: superAdmin.name,
        role: superAdmin.role,
        organizationId: null
      },
      organization: null,
      redirectTo: '/super-admin'
    }
  });
});

/**
 * Logout - Clear authentication cookie
 */
export const logout = asyncHandler(async (req, res, next) => {
  res.cookie('token', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    expires: new Date(0)
  });

  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully'
  });
});

/**
 * Get current user
 */
export const getCurrentUser = asyncHandler(async (req, res, next) => {
  let organization = null;

  if (req.organizationId) {
    organization = await Organization.findById(req.organizationId);
  }

  // Super admin has admin privileges even when impersonating
  const hasAdminPrivileges = req.user.role === 'ADMIN' || 
                             req.user.role === 'SUPER_ADMIN' ||
                             (req.isImpersonating && req.user.role === 'SUPER_ADMIN');

  res.status(200).json({
    status: 'success',
    data: {
      user: req.user,
      organization,
      isImpersonating: req.isImpersonating || false,
      hasAdminPrivileges // Explicitly indicate admin access
    }
  });
});

/**
 * Super Admin Impersonation - Login as company
 */
export const impersonateOrganization = asyncHandler(async (req, res, next) => {
  const { organizationId } = req.body;

  if (req.user.role !== 'SUPER_ADMIN') {
    return next(new AppError('Only super admin can impersonate organizations.', 403));
  }

  // Verify organization exists
  const organization = await Organization.findById(organizationId);
  if (!organization) {
    return next(new AppError('Organization not found.', 404));
  }

  // Log audit
  await AuditLog.create({
    userId: req.user._id,
    action: 'IMPERSONATION_START',
    targetOrganizationId: organization._id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  // Generate impersonation token
  const token = generateImpersonationToken(req.user._id, organization._id);

  // Set cookie with proper configuration for cross-origin
  const cookieOptions = {
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/'
  };

  res.cookie('token', token, cookieOptions);

  res.status(200).json({
    status: 'success',
    data: {
      organization,
      redirectTo: `/${organization.slug}`
    }
  });
});

/**
 * Exit impersonation
 */
export const exitImpersonation = asyncHandler(async (req, res, next) => {
  if (!req.isImpersonating) {
    return next(new AppError('Not currently impersonating.', 400));
  }

  // Log audit
  await AuditLog.create({
    userId: req.user._id,
    action: 'IMPERSONATION_END',
    targetOrganizationId: req.organizationId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  // Generate regular super admin token
  const token = generateToken({
    userId: req.user._id,
    role: req.user.role
  });

  // Set cookie with proper configuration for cross-origin
  const cookieOptions = {
    expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/'
  };

  res.cookie('token', token, cookieOptions);

  res.status(200).json({
    status: 'success',
    message: 'Impersonation ended',
    data: {
      redirectTo: '/super-admin'
    }
  });
});

/**
 * Update FCM token for push notifications
 */
export const updateFCMToken = asyncHandler(async (req, res, next) => {
  const { fcmToken } = req.body;

  if (!fcmToken) {
    return next(new AppError('FCM token is required.', 400));
  }

  // Add token if not already present
  if (!req.user.fcmTokens.includes(fcmToken)) {
    req.user.fcmTokens.push(fcmToken);
    await req.user.save({ validateBeforeSave: false });
  }

  res.status(200).json({
    status: 'success',
    message: 'FCM token updated'
  });
});

export default {
  companySignup,
  login,
  logout,
  getCurrentUser,
  impersonateOrganization,
  exitImpersonation,
  updateFCMToken
};
