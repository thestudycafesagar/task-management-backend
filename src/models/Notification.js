import mongoose from 'mongoose';

/**
 * Notification Schema - Multi-tenant notification model
 */
const notificationSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: [true, 'Organization ID is required'],
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  type: {
    type: String,
    enum: ['TASK_ASSIGNED', 'TASK_UPDATED', 'TASK_OVERDUE', 'TASK_COMPLETED'],
    required: true,
    index: true
  },
  message: {
    type: String,
    required: [true, 'Notification message is required'],
    trim: true
  },
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    index: true
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
notificationSchema.index({ organizationId: 1, userId: 1, isRead: 1 });
notificationSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
