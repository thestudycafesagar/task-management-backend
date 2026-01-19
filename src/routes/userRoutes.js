import express from 'express';
import { body } from 'express-validator';
import validate from '../middleware/validate.js';
import { protect, restrictTo, checkOrganizationAccess } from '../middleware/auth.js';
import {
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
} from '../controllers/userController.js';

const router = express.Router();

/**
 * All routes require authentication
 */
router.use(protect);

/**
 * User profile routes (accessible to all authenticated users)
 */
router.get('/profile', getUserProfile);
router.patch('/profile', updateUserProfile);
router.post('/fcm-token', registerFCMToken);
router.delete('/fcm-token', removeFCMToken);

/**
 * Change own password (requires current password)
 */
router.patch(
  '/change-password',
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
  ],
  validate,
  changePassword
);

/**
 * Organization-specific routes
 */
router.use(checkOrganizationAccess);

/**
 * Admin only routes
 */
router.get('/', restrictTo('ADMIN', 'SUPER_ADMIN'), getEmployees);

router.post(
  '/',
  restrictTo('ADMIN', 'SUPER_ADMIN'),
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('role').optional().trim().notEmpty().withMessage('Role cannot be empty')
  ],
  validate,
  createEmployee
);

router.get('/:employeeId', restrictTo('ADMIN', 'SUPER_ADMIN'), getEmployeeById);

router.patch(
  '/:employeeId',
  restrictTo('ADMIN', 'SUPER_ADMIN'),
  [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('role').optional().trim().notEmpty().withMessage('Role cannot be empty'),
    body('password').optional().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
  ],
  validate,
  updateEmployee
);

router.delete('/:employeeId', restrictTo('ADMIN', 'SUPER_ADMIN'), deleteEmployee);

/**
 * Super Admin impersonation-only route
 * Force change password without current password (only when impersonating)
 */
router.post(
  '/:userId/force-change-password',
  restrictTo('SUPER_ADMIN'),
  [
    body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
  ],
  validate,
  forceChangePassword
);

export default router;
