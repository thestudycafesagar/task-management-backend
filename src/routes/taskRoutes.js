import express from 'express';
import { body } from 'express-validator';
import validate from '../middleware/validate.js';
import { protect, restrictTo, checkOrganizationAccess } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  uploadAttachment,
  generateCalendarFile,
  getTaskStats,
  acceptTask,
  startTask,
  submitTask,
  completeTask,
  rejectTask,
  addComment
} from '../controllers/taskController.js';

const router = express.Router();

/**
 * All routes require authentication
 */
router.use(protect);
router.use(checkOrganizationAccess);

/**
 * Task routes
 */
router.get('/stats', getTaskStats);
router.get('/', getTasks);

router.post(
  '/',
  restrictTo('ADMIN', 'SUPER_ADMIN'),
  [
    body('title').trim().notEmpty().withMessage('Task title is required'),
    body('description').optional().trim(),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH']).withMessage('Invalid priority'),
    body('dueDate').optional().isISO8601().withMessage('Invalid date format'),
    body('assignedTo').notEmpty().withMessage('Task must be assigned to someone')
  ],
  validate,
  createTask
);

router.get('/:taskId', getTaskById);

router.patch(
  '/:taskId',
  [
    body('title').optional().trim().notEmpty().withMessage('Task title cannot be empty'),
    body('description').optional().trim(),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH']).withMessage('Invalid priority'),
    body('status')
      .optional()
      .isIn(['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'OVERDUE'])
      .withMessage('Invalid status'),
    body('dueDate').optional().isISO8601().withMessage('Invalid date format'),
    body('assignedTo').optional().notEmpty().withMessage('Assigned user cannot be empty')
  ],
  validate,
  updateTask
);

router.delete('/:taskId', restrictTo('ADMIN', 'SUPER_ADMIN'), deleteTask);

router.post('/:taskId/attachments', upload.single('file'), uploadAttachment);

router.get('/:taskId/calendar.ics', generateCalendarFile);

// Employee task actions
router.post('/:taskId/accept', acceptTask);
router.post('/:taskId/start', startTask);
router.post(
  '/:taskId/submit',
  [body('submissionNote').optional().trim()],
  validate,
  submitTask
);

// Admin task actions
router.post(
  '/:taskId/complete',
  restrictTo('ADMIN', 'SUPER_ADMIN'),
  [body('adminFeedback').optional().trim()],
  validate,
  completeTask
);

router.post(
  '/:taskId/reject',
  restrictTo('ADMIN', 'SUPER_ADMIN'),
  [body('adminFeedback').optional().trim()],
  validate,
  rejectTask
);

// Two-way communication
router.post(
  '/:taskId/comments',
  [body('message').trim().notEmpty().withMessage('Comment message is required')],
  validate,
  addComment
);

export default router;
