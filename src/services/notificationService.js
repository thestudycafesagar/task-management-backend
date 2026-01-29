import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { getMessaging } from '../config/firebase.js';
import { getIO } from './socket.js';
import logger from '../utils/logger.js';

/**
 * Create notification and send via Socket.IO, FCM, and save to DB
 */
export const createNotification = async ({ 
  organizationId, 
  userId, 
  type, 
  message, 
  taskId 
}) => {
  try {
    // 1. Save to database
    const notification = await Notification.create({
      organizationId,
      userId,
      type,
      message,
      taskId
    });

    await notification.populate('taskId', 'title');

    // 2. Send via Socket.IO (real-time)
    try {
      const io = getIO();
      if (io) {
        io.to(`user-${userId.toString()}`).emit('notification', {
          ...notification.toObject(),
          timestamp: new Date()
        });
        logger.debug(`Notification sent via Socket.IO to user-${userId}`);
      } else {
        logger.debug('Socket.IO not available - notification saved to DB only');
      }
    } catch (socketError) {
      logger.error('Socket.IO emit error:', socketError.message);
      // Continue even if Socket.IO fails - notification is still in DB
    }

    // 3. Send via Firebase Cloud Messaging (push notification)
    try {
      await sendPushNotification(userId, message, notification);
    } catch (fcmError) {
      logger.error('FCM error:', fcmError.message);
      // Continue even if FCM fails - notification is still in DB
    }

    return notification;
  } catch (error) {
    logger.error('Error creating notification:', error);
    throw error;
  }
};

/**
 * Send push notification via FCM
 */
const sendPushNotification = async (userId, message, notificationData) => {
  try {
    const user = await User.findById(userId);
    
    if (!user) {
      logger.debug('User not found for FCM notification');
      return;
    }

    if (!user.fcmTokens || user.fcmTokens.length === 0) {
      logger.debug('No FCM tokens registered for user');
      return;
    }

    const messaging = getMessaging();
    if (!messaging) {
      logger.debug('Firebase messaging not initialized');
      return;
    }

    logger.debug(`Sending push notification to ${user.fcmTokens.length} device(s)`);

    // Professional notification payload with app branding
    const notificationTitle = {
      'TASK_ASSIGNED': '📋 New Task Assigned',
      'TASK_UPDATED': '🔄 Task Updated',
      'TASK_COMPLETED': '✅ Task Completed',
      'TASK_OVERDUE': '⚠️ Task Overdue'
    }[notificationData.type] || '🔔 Task Management';

    const messagePayload = {
      notification: {
        title: notificationTitle,
        body: message
      },
      data: {
        notificationId: notificationData._id.toString(),
        type: notificationData.type,
        taskId: notificationData.taskId ? notificationData.taskId.toString() : '',
        url: `/dashboard/tasks`,
        timestamp: new Date().toISOString(),
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      },
      webpush: {
        headers: {
          Urgency: 'high'
        },
        fcm_options: {
          link: '/dashboard/tasks'
        }
      }
    };

    // Send to all user's FCM tokens
    let successCount = 0;
    let failCount = 0;
    
    const promises = user.fcmTokens.map(async (token) => {
      try {
        await messaging.send({
          ...messagePayload,
          token
        });
        successCount++;
        logger.debug('Push notification sent successfully');
      } catch (error) {
        failCount++;
        logger.error('Failed to send push notification:', {
          code: error.code,
          message: error.message
        });
        
        // Remove invalid tokens
        if (error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered') {
          logger.debug('Removing invalid FCM token');
          user.fcmTokens = user.fcmTokens.filter(t => t !== token);
          await user.save({ validateBeforeSave: false });
        }
      }
    });

    await Promise.all(promises);
    logger.debug(`Push notification summary: ${successCount} sent, ${failCount} failed`);
  } catch (error) {
    logger.error('Error sending push notification:', error);
  }
};

/**
 * Notify about task assignment
 */
export const notifyTaskAssigned = async (task, assignedUser) => {
  const assignerName = task.createdBy?.name || 'Admin';
  const priorityEmoji = {
    'LOW': '🟢',
    'MEDIUM': '🟡',
    'HIGH': '🔴',
    'URGENT': '🚨'
  }[task.priority] || '📋';

  await createNotification({
    organizationId: task.organizationId,
    userId: assignedUser._id,
    type: 'TASK_ASSIGNED',
    message: `${priorityEmoji} ${assignerName} assigned you: "${task.title}"`,
    taskId: task._id,
    metadata: {
      assignedBy: assignerName,
      priority: task.priority,
      dueDate: task.dueDate
    }
  });
};

/**
 * Notify about task update
 */
export const notifyTaskUpdated = async (task, adminUser) => {
  // Notify admin about employee's update
  if (adminUser) {
    await createNotification({
      organizationId: task.organizationId,
      userId: adminUser._id,
      type: 'TASK_UPDATED',
      message: `Task updated: ${task.title}`,
      taskId: task._id
    });
  }
};

/**
 * Notify about overdue task
 * Sends notifications to assigned employees and admin
 */
export const notifyTaskOverdue = async (task) => {
  try {
    // Notify assigned employees
    const assignedToArray = Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo];
    
    for (const assignedUser of assignedToArray) {
      // Extract user ID if it's a populated object
      const userId = assignedUser._id || assignedUser;
      
      // Skip if no valid user ID
      if (!userId) continue;

      await createNotification({
        organizationId: task.organizationId,
        userId: userId,
        type: 'TASK_OVERDUE',
        message: `⚠️ Task is overdue: "${task.title}" - Please complete it urgently!`,
        taskId: task._id
      });
      
      logger.debug(`Overdue notification sent to employee: ${assignedUser.name || userId}`);
    }

    // Notify all admins in the organization
    const admins = await User.find({
      organizationId: task.organizationId,
      $or: [
        { role: 'ADMIN' },
        { role: 'SUPER_ADMIN' },
        { 'permissions.canManageTasks': true }
      ],
      isActive: true
    });

    for (const admin of admins) {
      const assignedNames = assignedToArray
        .map(u => u.name || 'Unknown')
        .join(', ');
      
      await createNotification({
        organizationId: task.organizationId,
        userId: admin._id,
        type: 'TASK_OVERDUE',
        message: `⚠️ Task overdue: "${task.title}" - Assigned to: ${assignedNames}`,
        taskId: task._id
      });
      
      logger.debug(`Overdue notification sent to admin: ${admin.name}`);
    }
  } catch (error) {
    logger.error('Error in notifyTaskOverdue:', error);
    throw error;
  }
};

/**
 * Notify about task completion
 */
export const notifyTaskCompleted = async (task) => {
  const admin = await User.findOne({
    organizationId: task.organizationId,
    role: 'ADMIN',
    isActive: true
  });

  if (admin) {
    await createNotification({
      organizationId: task.organizationId,
      userId: admin._id,
      type: 'TASK_COMPLETED',
      message: `✅ Task completed: "${task.title}"`,
      taskId: task._id
    });
  }
};

export default {
  createNotification,
  notifyTaskAssigned,
  notifyTaskUpdated,
  notifyTaskOverdue,
  notifyTaskCompleted
};
