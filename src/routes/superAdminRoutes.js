import express from 'express';
import { protect, restrictTo } from '../middleware/auth.js';
import {
  getAllOrganizations,
  getOrganizationById,
  toggleOrganizationStatus,
  getAuditLogs
} from '../controllers/superAdminController.js';

const router = express.Router();

/**
 * All routes require Super Admin authentication
 */
router.use(protect);
router.use(restrictTo('SUPER_ADMIN'));

router.get('/organizations', getAllOrganizations);
router.get('/organizations/:organizationId', getOrganizationById);
router.patch('/organizations/:organizationId/toggle-status', toggleOrganizationStatus);
router.get('/audit-logs', getAuditLogs);

export default router;
