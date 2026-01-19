import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/appError.js';
import { verifyToken } from '../utils/jwt.js';
import User from '../models/User.js';

/**
 * Protect routes - verify JWT token and attach user to request
 */
export const protect = asyncHandler(async (req, res, next) => {
  let token;

  // Check for token in cookies
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return next(new AppError('Not authorized. Please log in.', 401));
  }

  // Verify token
  const decoded = verifyToken(token);
  if (!decoded) {
    return next(new AppError('Invalid or expired token. Please log in again.', 401));
  }

  // Check if user still exists
  // For impersonation tokens, use superAdminId; for regular tokens, use userId
  const userId = decoded.isImpersonating ? decoded.superAdminId : decoded.userId;
  const user = await User.findById(userId);
  
  if (!user) {
    // Clear invalid cookie
    res.cookie('token', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      expires: new Date(0)
    });
    return next(new AppError('User no longer exists. Please log in again.', 401));
  }

  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated.', 401));
  }

  // Handle impersonation
  if (decoded.isImpersonating) {
    // Super admin impersonating an organization
    req.user = user; // Original super admin
    req.organizationId = decoded.targetOrganizationId;
    req.isImpersonating = true;
    
    console.log('👤 Impersonation active:', {
      superAdmin: user.email,
      targetOrg: decoded.targetOrganizationId,
      role: user.role
    });
  } else {
    req.user = user;
    req.organizationId = user.organizationId;
    req.isImpersonating = false;
  }

  next();
});

/**
 * Restrict access to specific roles
 * When impersonating, super admin gets full admin privileges
 */
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    console.log('🔒 restrictTo check:', {
      requiredRoles: roles,
      userRole: req.user.role,
      isImpersonating: req.isImpersonating,
      organizationId: req.organizationId
    });

    // Super admin ALWAYS has access to SUPER_ADMIN routes, even when impersonating
    // This allows them to view organizations, switch impersonation, etc.
    if (req.user.role === 'SUPER_ADMIN' && roles.includes('SUPER_ADMIN')) {
      console.log('✅ Super admin access granted (including during impersonation)');
      return next();
    }

    // Super admin impersonating should have FULL ADMIN + EMPLOYEE access to organization routes
    if (req.isImpersonating && req.user.role === 'SUPER_ADMIN') {
      // For routes that include ADMIN or EMPLOYEE, allow access (full organization access)
      if (roles.includes('ADMIN') || roles.includes('EMPLOYEE')) {
        console.log('✅ Impersonating super admin granted full organization access');
        return next();
      }
    }
    
    // Regular role check
    if (!roles.includes(req.user.role)) {
      console.log('❌ Access denied - role not in allowed roles');
      return next(
        new AppError('You do not have permission to perform this action.', 403)
      );
    }
    
    console.log('✅ Access granted');
    next();
  };
};

/**
 * Check if user has admin privileges (ADMIN or SUPER_ADMIN)
 * When impersonating, super admin acts as ADMIN
 */
export const requireAdmin = (req, res, next) => {
  const isAdmin = req.user.role === 'ADMIN' || 
                  req.user.role === 'SUPER_ADMIN' || 
                  (req.isImpersonating && req.user.role === 'SUPER_ADMIN');
  
  if (!isAdmin) {
    return next(new AppError('Admin access required.', 403));
  }
  next();
};

/**
 * Check if user belongs to organization
 */
export const checkOrganizationAccess = asyncHandler(async (req, res, next) => {
  // Super admin has access to all organizations
  if (req.user.role === 'SUPER_ADMIN') {
    return next();
  }

  // Check if user's organizationId matches the request context
  if (!req.organizationId) {
    return next(new AppError('Organization context is missing.', 400));
  }

  if (req.user.organizationId.toString() !== req.organizationId.toString()) {
    return next(new AppError('Access denied to this organization.', 403));
  }

  next();
});

export default { protect, restrictTo, requireAdmin, checkOrganizationAccess };
