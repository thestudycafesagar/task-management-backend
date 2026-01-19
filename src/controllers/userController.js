import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/appError.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';

/**
 * Get all employees in organization
 */
export const getEmployees = asyncHandler(async (req, res, next) => {
  const employees = await User.find({
    organizationId: req.organizationId,
    isActive: true
  }).select('-password').sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    results: employees.length,
    data: { employees }
  });
});

/**
 * Create employee
 */
export const createEmployee = asyncHandler(async (req, res, next) => {
  const { name, email, password, role } = req.body;

  // Check if email already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError('Email already registered.', 400));
  }

  // Create employee with explicit isActive set to true
  const employee = await User.create({
    organizationId: req.organizationId,
    name,
    email,
    password,
    role: role || 'EMPLOYEE',
    isActive: true
  });

  // Refresh employee data to exclude password
  const createdEmployee = await User.findById(employee._id).select('-password');

  // Log audit
  await AuditLog.create({
    userId: req.user._id,
    action: 'USER_CREATED',
    targetOrganizationId: req.organizationId,
    targetUserId: employee._id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.status(201).json({
    status: 'success',
    data: { employee: createdEmployee }
  });
});

/**
 * Update employee
 */
export const updateEmployee = asyncHandler(async (req, res, next) => {
  const { employeeId } = req.params;
  const { name, role, password, isActive } = req.body;

  const employee = await User.findOne({
    _id: employeeId,
    organizationId: req.organizationId
  });

  if (!employee) {
    return next(new AppError('Employee not found.', 404));
  }

  // Update fields
  if (name) employee.name = name;
  if (role) employee.role = role;
  if (password) employee.password = password; // Will be hashed by pre-save hook
  if (typeof isActive === 'boolean') employee.isActive = isActive;

  await employee.save();

  res.status(200).json({
    status: 'success',
    data: { employee }
  });
});

/**
 * Delete employee (soft delete by deactivating)
 */
export const deleteEmployee = asyncHandler(async (req, res, next) => {
  const { employeeId } = req.params;

  const employee = await User.findOne({
    _id: employeeId,
    organizationId: req.organizationId
  });

  if (!employee) {
    return next(new AppError('Employee not found.', 404));
  }

  employee.isActive = false;
  await employee.save();

  // Log audit
  await AuditLog.create({
    userId: req.user._id,
    action: 'USER_DELETED',
    targetOrganizationId: req.organizationId,
    targetUserId: employee._id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.status(200).json({
    status: 'success',
    message: 'Employee deactivated successfully'
  });
});

/**
 * Get employee by ID
 */
export const getEmployeeById = asyncHandler(async (req, res, next) => {
  const { employeeId } = req.params;

  const employee = await User.findOne({
    _id: employeeId,
    organizationId: req.organizationId
  }).select('-password');

  if (!employee) {
    return next(new AppError('Employee not found.', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { employee }
  });
});

/**
 * Get current user profile
 */
export const getUserProfile = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id).select('-password');

  if (!user) {
    return next(new AppError('User not found.', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { user }
  });
});

/**
 * Update current user profile
 */
export const updateUserProfile = asyncHandler(async (req, res, next) => {
  const { notificationSettings, name } = req.body;

  const user = await User.findById(req.user._id);

  if (!user) {
    return next(new AppError('User not found.', 404));
  }

  // Update notification settings
  if (notificationSettings) {
    user.notificationSettings = {
      ...user.notificationSettings,
      ...notificationSettings
    };
  }

  // Update name if provided
  if (name) {
    user.name = name;
  }

  await user.save();

  res.status(200).json({
    status: 'success',
    data: { user }
  });
});

/**
 * Register FCM token for push notifications
 */
export const registerFCMToken = asyncHandler(async (req, res, next) => {
  const { fcmToken } = req.body;

  if (!fcmToken) {
    return next(new AppError('FCM token is required.', 400));
  }

  const user = await User.findById(req.user._id);

  if (!user) {
    return next(new AppError('User not found.', 404));
  }

  // Add token if it doesn't already exist
  if (!user.fcmTokens.includes(fcmToken)) {
    user.fcmTokens.push(fcmToken);
    await user.save();
    console.log('✅ FCM token registered successfully');
  }

  res.status(200).json({
    status: 'success',
    message: 'FCM token registered successfully'
  });
});

/**
 * Remove FCM token
 */
export const removeFCMToken = asyncHandler(async (req, res, next) => {
  const { fcmToken } = req.body;

  if (!fcmToken) {
    return next(new AppError('FCM token is required.', 400));
  }

  const user = await User.findById(req.user._id);

  if (!user) {
    return next(new AppError('User not found.', 404));
  }

  // Remove token
  user.fcmTokens = user.fcmTokens.filter(token => token !== fcmToken);
  await user.save();

  res.status(200).json({
    status: 'success',
    message: 'FCM token removed successfully'
  });
});

/**
 * Change own password (requires current password)
 */
export const changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next(new AppError('Current password and new password are required.', 400));
  }

  if (newPassword.length < 8) {
    return next(new AppError('New password must be at least 8 characters.', 400));
  }

  // Get user with password field
  const user = await User.findById(req.user._id).select('+password');

  if (!user) {
    return next(new AppError('User not found.', 404));
  }

  // Verify current password
  const isPasswordCorrect = await user.comparePassword(currentPassword);
  if (!isPasswordCorrect) {
    return next(new AppError('Current password is incorrect.', 401));
  }

  // Update password
  user.password = newPassword;
  user.markModified('password'); // Explicitly mark as modified
  await user.save();

  // Log audit
  await AuditLog.create({
    userId: req.user._id,
    action: 'PASSWORD_CHANGED',
    targetOrganizationId: req.organizationId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.status(200).json({
    status: 'success',
    message: 'Password changed successfully'
  });
});

/**
 * Force change user password (Super Admin only when impersonating)
 * No current password required - super admin privilege
 */
export const forceChangePassword = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const { newPassword } = req.body;

  // Only allow when super admin is impersonating
  if (!req.isImpersonating || req.user.role !== 'SUPER_ADMIN') {
    return next(new AppError('This action requires super admin impersonation.', 403));
  }

  if (!newPassword) {
    return next(new AppError('New password is required.', 400));
  }

  if (newPassword.length < 8) {
    return next(new AppError('Password must be at least 8 characters.', 400));
  }

  // Find user in the impersonated organization (select password field)
  const user = await User.findOne({
    _id: userId,
    organizationId: req.organizationId
  }).select('+password');

  if (!user) {
    return next(new AppError('User not found in this organization.', 404));
  }

  console.log('🔐 Changing password for user:', user.email);
  console.log('📝 New password length:', newPassword.length);

  // Update password (will be hashed by pre-save hook)
  user.password = newPassword;
  await user.save({ validateBeforeSave: true });

  console.log('✅ Password saved successfully for:', user.email);

  // Log audit
  await AuditLog.create({
    userId: req.user._id,
    action: 'PASSWORD_FORCE_CHANGED',
    targetOrganizationId: req.organizationId,
    targetUserId: user._id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.status(200).json({
    status: 'success',
    message: 'Password changed successfully'
  });
});

export default {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeById,
  getUserProfile,
  updateUserProfile,
  registerFCMToken,
  removeFCMToken,
  changePassword,
  forceChangePassword
};
