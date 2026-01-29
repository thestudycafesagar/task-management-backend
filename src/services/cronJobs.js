import cron from 'node-cron';
import Task from '../models/Task.js';
import User from '../models/User.js';
import { notifyTaskOverdue } from '../services/notificationService.js';
import { getIO } from './socket.js';
import logger from '../utils/logger.js';

/**
 * Check for overdue tasks and update status
 * Runs every 15 minutes to detect overdue tasks quickly
 */
export const checkOverdueTasks = () => {
  cron.schedule('*/15 * * * *', async () => {
    try {
      logger.debug('Checking for overdue tasks...');

      const now = new Date();

      // Find tasks that are overdue (not yet marked as OVERDUE, COMPLETED, or REJECTED)
      const overdueTasks = await Task.find({
        dueDate: { $lt: now },
        status: { $in: ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED'] },
        isDeleted: false
      }).populate('assignedTo', '_id name email')
        .populate('createdBy', '_id name email');

      logger.debug(`Found ${overdueTasks.length} overdue tasks`);

      // Update status and send notifications
      for (const task of overdueTasks) {
        try {
          const previousStatus = task.status;
          task.status = 'OVERDUE';
          await task.save();

          // Send notifications to assigned employees
          await notifyTaskOverdue(task);

          // Also notify all admins in the organization
          const admins = await User.find({
            organizationId: task.organizationId,
            $or: [
              { role: 'ADMIN' },
              { role: 'SUPER_ADMIN' },
              { 'permissions.canManageTasks': true }
            ],
            isActive: true
          });

          // Notify each admin
          for (const admin of admins) {
            await notifyTaskOverdue({
              ...task.toObject(),
              assignedTo: [admin] // Temporary override for notification
            });
          }

          // Broadcast real-time update via Socket.IO
          try {
            const io = getIO();
            if (io) {
              io.to(`org-${task.organizationId}`).emit('task-updated', {
                task: task.toObject(),
                action: 'OVERDUE',
                statusChanged: true,
                previousStatus,
                timestamp: new Date()
              });
              logger.debug(`Socket.IO broadcast sent for overdue task: ${task.title}`);
            }
          } catch (socketError) {
            logger.error('Socket.IO broadcast error:', socketError.message);
          }
          
          logger.debug(`Task marked as overdue: ${task.title}`);
        } catch (error) {
          logger.error(`Error processing overdue task ${task._id}:`, error.message);
        }
      }

      if (overdueTasks.length > 0) {
        logger.debug(`Overdue tasks check completed - ${overdueTasks.length} tasks marked as overdue`);
      }
    } catch (error) {
      logger.error('Error checking overdue tasks:', error);
    }
  });

  logger.startup('Cron job for overdue tasks scheduled (runs every 15 minutes)');
};

/**
 * Initialize all cron jobs
 */
export const initCronJobs = () => {
  checkOverdueTasks();
};

export default { initCronJobs };
