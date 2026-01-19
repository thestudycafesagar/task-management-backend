import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/appError.js';
import Organization from '../models/Organization.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';

/**
 * Get all organizations (Super Admin only)
 */
export const getAllOrganizations = asyncHandler(async (req, res, next) => {
  const { search, isActive } = req.query;

  const filter = {};

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { slug: { $regex: search, $options: 'i' } }
    ];
  }

  if (isActive !== undefined) {
    filter.isActive = isActive === 'true';
  }

  const organizations = await Organization.find(filter).sort({ createdAt: -1 });

  // Get admin count for each organization
  const orgsWithStats = await Promise.all(
    organizations.map(async (org) => {
      const adminCount = await User.countDocuments({
        organizationId: org._id,
        role: 'ADMIN',
        isActive: true
      });

      const employeeCount = await User.countDocuments({
        organizationId: org._id,
        role: 'EMPLOYEE',
        isActive: true
      });

      return {
        ...org.toObject(),
        adminCount,
        employeeCount
      };
    })
  );

  res.status(200).json({
    status: 'success',
    results: orgsWithStats.length,
    data: { organizations: orgsWithStats }
  });
});

/**
 * Get organization by ID
 */
export const getOrganizationById = asyncHandler(async (req, res, next) => {
  const { organizationId } = req.params;

  const organization = await Organization.findById(organizationId);

  if (!organization) {
    return next(new AppError('Organization not found.', 404));
  }

  // Get users
  const users = await User.find({
    organizationId: organization._id,
    isActive: true
  }).select('-password');

  res.status(200).json({
    status: 'success',
    data: {
      organization,
      users
    }
  });
});

/**
 * Toggle organization active status
 */
export const toggleOrganizationStatus = asyncHandler(async (req, res, next) => {
  const { organizationId } = req.params;

  const organization = await Organization.findById(organizationId);

  if (!organization) {
    return next(new AppError('Organization not found.', 404));
  }

  organization.isActive = !organization.isActive;
  await organization.save();

  // Log audit
  await AuditLog.create({
    userId: req.user._id,
    action: organization.isActive ? 'ORGANIZATION_ENABLED' : 'ORGANIZATION_DISABLED',
    targetOrganizationId: organization._id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.status(200).json({
    status: 'success',
    data: { organization }
  });
});

/**
 * Get audit logs
 */
export const getAuditLogs = asyncHandler(async (req, res, next) => {
  const { action, userId, organizationId } = req.query;

  const filter = {};

  if (action) filter.action = action;
  if (userId) filter.userId = userId;
  if (organizationId) filter.targetOrganizationId = organizationId;

  const logs = await AuditLog.find(filter)
    .populate('userId', 'name email role')
    .populate('targetOrganizationId', 'name slug')
    .populate('targetUserId', 'name email')
    .sort({ createdAt: -1 })
    .limit(100);

  res.status(200).json({
    status: 'success',
    results: logs.length,
    data: { logs }
  });
});

export default {
  getAllOrganizations,
  getOrganizationById,
  toggleOrganizationStatus,
  getAuditLogs
};
