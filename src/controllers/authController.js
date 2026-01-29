import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/appError.js';
import { authService } from '../services/auth.service.js';

/**
 * Cookie configuration helper - adapts to environment
 * CRITICAL: For same-domain deployments (frontend + backend on same domain),
 * use 'lax' sameSite. Only use 'none' for true cross-origin scenarios.
 */
const getCookieOptions = (expiresInDays = process.env.JWT_COOKIE_EXPIRES_IN || 7) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Check if frontend and backend are on the same domain
  // If CORS_ORIGIN matches BASE_URL domain, they're same-origin
  const corsOrigin = process.env.CORS_ORIGIN || '';
  const baseUrl = process.env.BASE_URL || '';
  const sameDomain = corsOrigin && baseUrl && 
    new URL(corsOrigin).hostname === new URL(baseUrl).hostname;
  
  return {
    expires: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: isProduction, // HTTPS only in production
    // Use 'lax' for same-domain (VPS) or 'none' for cross-origin (Vercel/Render)
    sameSite: isProduction ? (sameDomain ? 'lax' : 'none') : 'lax',
    path: '/'
  };
};

/**
 * Company self-signup - Creates organization and admin user
 */
export const companySignup = asyncHandler(async (req, res, next) => {
  const result = await authService.createOrganizationWithAdmin(
    req.body,
    { ip: req.ip, userAgent: req.get('user-agent') }
  );

  res.cookie('token', result.token, getCookieOptions());

  res.status(201).json({
    status: 'success',
    data: result
  });
});

/**
 * Login - Authenticate user
 */
export const login = asyncHandler(async (req, res, next) => {
  const result = await authService.authenticateUser(req.body);

  res.cookie('token', result.token, getCookieOptions());

  res.status(200).json({
    status: 'success',
    data: result
  });
});



/**
 * Super Admin Login - Hardcoded credentials from environment
 */
export const superAdminLogin = asyncHandler(async (req, res, next) => {
  const result = await authService.authenticateSuperAdmin(req.body);

  res.cookie('token', result.token, getCookieOptions());

  res.status(200).json({
    status: 'success',
    data: result
  });
});

/**
 * Logout - Clear authentication cookie
 */
export const logout = asyncHandler(async (req, res, next) => {
  res.cookie('token', '', {
    ...getCookieOptions(0),
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
  const result = await authService.getCurrentUserData(
    req.user._id,
    req.organizationId,
    req.isImpersonating,
    req.user.role
  );

  res.status(200).json({
    status: 'success',
    data: result
  });
});

/**
 * Super Admin Impersonation - Login as company
 */
export const impersonateOrganization = asyncHandler(async (req, res, next) => {
  if (req.user.role !== 'SUPER_ADMIN') {
    return next(new AppError('Only super admin can impersonate organizations.', 403));
  }

  const result = await authService.startImpersonation(
    req.user._id,
    req.body.organizationId,
    { ip: req.ip, userAgent: req.get('user-agent') }
  );

  res.cookie('token', result.token, getCookieOptions(1));

  res.status(200).json({
    status: 'success',
    data: result
  });
});

/**
 * Exit impersonation
 */
export const exitImpersonation = asyncHandler(async (req, res, next) => {
  if (!req.isImpersonating) {
    return next(new AppError('Not currently impersonating.', 400));
  }

  const result = await authService.endImpersonation(
    req.user._id,
    req.organizationId,
    { ip: req.ip, userAgent: req.get('user-agent') },
    req.user.role
  );

  res.cookie('token', result.token, getCookieOptions());

  res.status(200).json({
    status: 'success',
    message: 'Impersonation ended',
    data: result
  });
});

/**
 * Update FCM token for push notifications
 */
export const updateFCMToken = asyncHandler(async (req, res, next) => {
  const result = await authService.updateFCMToken(req.user._id, req.body.fcmToken);

  res.status(200).json({
    status: 'success',
    message: result.message
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
