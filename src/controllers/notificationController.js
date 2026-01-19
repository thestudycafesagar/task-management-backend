import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/appError.js';
import Notification from '../models/Notification.js';

/**
 * Get all notifications for user
 */
export const getNotifications = asyncHandler(async (req, res, next) => {
  const { isRead } = req.query;

  const filter = {
    organizationId: req.organizationId,
    userId: req.user._id
  };

  if (isRead !== undefined) {
    filter.isRead = isRead === 'true';
  }

  const notifications = await Notification.find(filter)
    .populate('taskId', 'title')
    .sort({ createdAt: -1 })
    .limit(50);

  const unreadCount = await Notification.countDocuments({
    organizationId: req.organizationId,
    userId: req.user._id,
    isRead: false
  });

  res.status(200).json({
    status: 'success',
    results: notifications.length,
    data: {
      notifications,
      unreadCount
    }
  });
});

/**
 * Mark notification as read
 */
export const markAsRead = asyncHandler(async (req, res, next) => {
  const { notificationId } = req.params;

  const notification = await Notification.findOne({
    _id: notificationId,
    organizationId: req.organizationId,
    userId: req.user._id
  });

  if (!notification) {
    return next(new AppError('Notification not found.', 404));
  }

  notification.isRead = true;
  notification.readAt = new Date();
  await notification.save();

  res.status(200).json({
    status: 'success',
    data: { notification }
  });
});

/**
 * Mark all notifications as read
 */
export const markAllAsRead = asyncHandler(async (req, res, next) => {
  await Notification.updateMany(
    {
      organizationId: req.organizationId,
      userId: req.user._id,
      isRead: false
    },
    {
      isRead: true,
      readAt: new Date()
    }
  );

  res.status(200).json({
    status: 'success',
    message: 'All notifications marked as read'
  });
});

/**
 * Delete notification
 */
export const deleteNotification = asyncHandler(async (req, res, next) => {
  const { notificationId } = req.params;

  const notification = await Notification.findOneAndDelete({
    _id: notificationId,
    organizationId: req.organizationId,
    userId: req.user._id
  });

  if (!notification) {
    return next(new AppError('Notification not found.', 404));
  }

  res.status(200).json({
    status: 'success',
    message: 'Notification deleted'
  });
});

/**
 * Clear all notifications (delete all for user)
 */
export const clearAllNotifications = asyncHandler(async (req, res, next) => {
  const result = await Notification.deleteMany({
    organizationId: req.organizationId,
    userId: req.user._id
  });

  res.status(200).json({
    status: 'success',
    message: `${result.deletedCount} notifications cleared`
  });
});

export default {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications
};
