import express from 'express';
import { body } from 'express-validator';
import validate from '../middleware/validate.js';
import {
  companySignup,
  login,
  superAdminLogin,
  logout,
  getCurrentUser,
  impersonateOrganization,
  exitImpersonation,
  updateFCMToken
} from '../controllers/authController.js';
import { protect, restrictTo } from '../middleware/auth.js';

const router = express.Router();

/**
 * Public routes
 */
router.post(
  '/signup',
  [
    body('companyName').trim().notEmpty().withMessage('Company name is required'),
    body('adminName').trim().notEmpty().withMessage('Admin name is required'),
    body('adminEmail').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
  ],
  validate,
  companySignup
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  validate,
  login
);

router.post(
  '/super-admin/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  validate,
  superAdminLogin
);

/**
 * Protected routes
 */
router.use(protect);

router.get('/me', getCurrentUser);
router.post('/logout', logout);

router.post(
  '/fcm-token',
  [body('fcmToken').notEmpty().withMessage('FCM token is required')],
  validate,
  updateFCMToken
);

/**
 * Super Admin only routes
 */
router.post(
  '/impersonate',
  restrictTo('SUPER_ADMIN'),
  [body('organizationId').notEmpty().withMessage('Organization ID is required')],
  validate,
  impersonateOrganization
);

router.post('/exit-impersonation', exitImpersonation);

export default router;
