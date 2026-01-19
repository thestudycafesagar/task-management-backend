import express from 'express';
import { protect, checkOrganizationAccess } from '../middleware/auth.js';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications
} from '../controllers/notificationController.js';

const router = express.Router();

/**
 * All routes require authentication
 */
router.use(protect);
router.use(checkOrganizationAccess);

router.get('/', getNotifications);
router.patch('/:notificationId/read', markAsRead);
router.patch('/read-all', markAllAsRead);
router.delete('/:notificationId', deleteNotification);
router.delete('/', clearAllNotifications);

export default router;
