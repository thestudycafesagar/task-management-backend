import cron from 'node-cron';
import Task from '../models/Task.js';
import { notifyTaskOverdue } from '../services/notificationService.js';

/**
 * Check for overdue tasks and update status
 * Runs every hour
 */
export const checkOverdueTasks = () => {
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('🔍 Checking for overdue tasks...');

      const now = new Date();

      // Find tasks that are overdue
      const overdueTasks = await Task.find({
        dueDate: { $lt: now },
        status: { $in: ['TODO', 'IN_PROGRESS'] },
        isDeleted: false
      }).populate('assignedTo', '_id name email');

      console.log(`Found ${overdueTasks.length} overdue tasks`);

      // Update status and send notifications
      for (const task of overdueTasks) {
        try {
          task.status = 'OVERDUE';
          await task.save();

          // Send notification to each assigned user
          await notifyTaskOverdue(task);
          
          console.log(`✅ Notified overdue task: ${task.title}`);
        } catch (error) {
          console.error(`❌ Error processing overdue task ${task._id}:`, error.message);
        }
      }

      console.log('✅ Overdue tasks check completed');
    } catch (error) {
      console.error('❌ Error checking overdue tasks:', error);
    }
  });

  console.log('✅ Cron job for overdue tasks scheduled');
};

/**
 * Initialize all cron jobs
 */
export const initCronJobs = () => {
  checkOverdueTasks();
};

export default { initCronJobs };
