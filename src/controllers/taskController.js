import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/appError.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import cloudinary from '../config/cloudinary.js';
import ical from 'ical-generator';
import { Readable } from 'stream';
import { notifyTaskAssigned, notifyTaskUpdated, createNotification } from '../services/notificationService.js';
import { getIO } from '../services/socket.js';

/**
 * Check if user has admin privileges
 * Includes: ADMIN, SUPER_ADMIN, or SUPER_ADMIN impersonating
 */
const hasAdminPrivileges = (req) => {
  return req.user.role === 'ADMIN' || 
         req.user.role === 'SUPER_ADMIN' || 
         (req.isImpersonating && req.user.role === 'SUPER_ADMIN');
};

/**
 * Get all tasks for organization
 */
export const getTasks = asyncHandler(async (req, res, next) => {
  const { status, priority, assignedTo } = req.query;

  const filter = {
    organizationId: req.organizationId,
    isDeleted: false
  };

  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (assignedTo) filter.assignedTo = assignedTo;

  // Only ADMIN and SUPER_ADMIN can see all tasks
  // All other users (employees with any role name) can only see their assigned tasks
  if (!hasAdminPrivileges(req)) {
    filter.assignedTo = { $in: [req.user._id] };
    console.log('🔒 EMPLOYEE FILTER APPLIED - User:', req.user.email, 'Role:', req.user.role, 'ID:', req.user._id);
  } else {
    console.log('👑 ADMIN ACCESS - User:', req.user.email, 'Role:', req.user.role, 'Impersonating:', req.isImpersonating);
  }

  console.log('📋 Task Filter:', JSON.stringify(filter, null, 2));

  const tasks = await Task.find(filter)
    .populate('assignedTo', 'name email')
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });

  console.log('✅ Found', tasks.length, 'tasks for', req.user.email);

  res.status(200).json({
    status: 'success',
    results: tasks.length,
    data: { tasks }
  });
});

/**
 * Get task by ID
 */
export const getTaskById = asyncHandler(async (req, res, next) => {
  const { taskId } = req.params;

  const filter = {
    _id: taskId,
    organizationId: req.organizationId,
    isDeleted: false
  };

  // Only ADMIN and SUPER_ADMIN can view all tasks
  // All other users (employees with any role name) can only view their assigned tasks
  if (!hasAdminPrivileges(req)) {
    filter.assignedTo = { $in: [req.user._id] };
    console.log('🔒 EMPLOYEE accessing task:', taskId, 'User:', req.user.email, 'Role:', req.user.role);
  } else {
    console.log('👑 ADMIN accessing task:', taskId, 'User:', req.user.email, 'Impersonating:', req.isImpersonating);
  }

  const task = await Task.findOne(filter)
    .populate('assignedTo', 'name email')
    .populate('createdBy', 'name email');

  if (!task) {
    console.log('❌ Task not found or not authorized:', taskId);
    return next(new AppError('Task not found.', 404));
  }

  console.log('✅ Task found:', task.title, 'Assigned to:', task.assignedTo.map(u => u.email).join(', '));

  res.status(200).json({
    status: 'success',
    data: { task }
  });
});

/**
 * Create task (Admin only)
 */
export const createTask = asyncHandler(async (req, res, next) => {
  const { title, description, priority, dueDate, assignedTo } = req.body;

  // Handle both single and multiple assignees
  const assignedToArray = Array.isArray(assignedTo) ? assignedTo : [assignedTo];

  // Verify all assignedTo users exist in organization
  const assignedUsers = await User.find({
    _id: { $in: assignedToArray },
    organizationId: req.organizationId,
    isActive: true
  });

  if (assignedUsers.length !== assignedToArray.length) {
    return next(new AppError('One or more assigned users not found in organization.', 404));
  }

  const task = await Task.create({
    organizationId: req.organizationId,
    title,
    description,
    priority,
    dueDate: dueDate || null,
    assignedTo: assignedToArray,
    createdBy: req.user._id
  });

  await task.populate('assignedTo', 'name email');
  await task.populate('createdBy', 'name email');

  // Send notification to all assigned users
  for (const assignedUser of assignedUsers) {
    await notifyTaskAssigned(task, assignedUser);
  }

  // Broadcast task creation to all organization members via Socket.IO
  try {
    const io = getIO();
    if (io) {
      // Send to all users in this organization
      io.to(`org-${task.organizationId}`).emit('task-created', {
        task: task.toObject(),
        createdBy: req.user.email
      });
      console.log(`📡 Broadcasted task-created to organization: ${task.organizationId}`);
    }
  } catch (error) {
    console.error('Failed to broadcast task-created:', error.message);
  }

  res.status(201).json({
    status: 'success',
    data: { task }
  });
});

/**
 * Update task
 */
export const updateTask = asyncHandler(async (req, res, next) => {
  const { taskId } = req.params;
  const { title, description, priority, status, dueDate, assignedTo } = req.body;

  const filter = {
    _id: taskId,
    organizationId: req.organizationId,
    isDeleted: false
  };

  // Employees (non-ADMIN/SUPER_ADMIN) can only update their assigned tasks
  if (!hasAdminPrivileges(req)) {
    filter.assignedTo = { $in: [req.user._id] };
    console.log('🔒 EMPLOYEE UPDATE FILTER - User:', req.user.email, 'Role:', req.user.role);
  }

  const task = await Task.findOne(filter);

  if (!task) {
    return next(new AppError('Task not found.', 404));
  }

  // Store old status and assignedTo BEFORE making changes
  const oldStatus = task.status;
  const statusChanged = status && status !== oldStatus;
  
  // Store old assignedTo for comparison (convert to string for comparison)
  const oldAssignedToIds = task.assignedTo.map(id => id.toString());
  let assignmentChanged = false;
  let newAssignees = [];

  console.log('📝 Task update:', {
    taskId: task._id,
    oldStatus,
    newStatus: status,
    statusChanged,
    updatedBy: req.user.email
  });

  // Employees can only update status
  if (!hasAdminPrivileges(req)) {
    if (status) task.status = status;
  } else {
    // Admin can update all fields
    if (title) task.title = title;
    if (description) task.description = description;
    if (priority) task.priority = priority;
    if (status) task.status = status;
    if (dueDate !== undefined) task.dueDate = dueDate;
    if (assignedTo) {
      // Handle both single and multiple assignees
      const assignedToArray = Array.isArray(assignedTo) ? assignedTo : [assignedTo];
      const assignedUsers = await User.find({
        _id: { $in: assignedToArray },
        organizationId: req.organizationId,
        isActive: true
      });
      if (assignedUsers.length !== assignedToArray.length) {
        return next(new AppError('One or more assigned users not found in organization.', 404));
      }
      
      // Check if assignment changed
      const newAssignedToIds = assignedToArray.map(id => id.toString());
      assignmentChanged = JSON.stringify(oldAssignedToIds.sort()) !== JSON.stringify(newAssignedToIds.sort());
      
      // Find newly added assignees
      if (assignmentChanged) {
        newAssignees = assignedUsers.filter(user => 
          !oldAssignedToIds.includes(user._id.toString())
        );
      }
      
      task.assignedTo = assignedToArray;
    }
  }

  await task.save();
  await task.populate('assignedTo', 'name email');
  await task.populate('createdBy', 'name email');

  // Notify newly assigned users
  if (assignmentChanged && newAssignees.length > 0) {
    console.log('👥 Assignment changed - notifying new assignees');
    for (const assignedUser of newAssignees) {
      console.log(`📤 Notifying newly assigned user: ${assignedUser.email}`);
      await notifyTaskAssigned(task, assignedUser);
    }
  }

  // Notify about task update
  if (statusChanged) {
    console.log('🔔 Status changed - sending notifications');
    
    const updaterName = req.user.name || req.user.email.split('@')[0];
    const statusEmoji = {
      'TODO': '📋',
      'IN_PROGRESS': '🔄',
      'COMPLETED': '✅',
      'CANCELLED': '❌'
    };

    if (hasAdminPrivileges(req)) {
      // Admin updated - notify all assigned employees
      console.log('👑 Admin updated task - notifying employees');
      const assignedToArray = Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo];
      
      for (const assignedUser of assignedToArray) {
        console.log(`📤 Sending notification to employee: ${assignedUser.email}`);
        await createNotification({
          organizationId: task.organizationId,
          userId: assignedUser._id,
          type: 'TASK_UPDATED',
          message: `${statusEmoji[status] || '📝'} ${updaterName} changed "${task.title}" status to ${status.replace('_', ' ')}`,
          taskId: task._id,
          metadata: {
            updatedBy: req.user.name,
            oldStatus,
            newStatus: status,
            priority: task.priority
          }
        });
      }
    } else {
      // Employee updated - notify admin/creator
      console.log(`👤 Employee ${req.user.email} updated task - notifying admin/creator: ${task.createdBy.email}`);
      await createNotification({
        organizationId: task.organizationId,
        userId: task.createdBy._id,
        type: 'TASK_UPDATED',
        message: `${statusEmoji[status] || '📝'} ${updaterName} changed "${task.title}" status to ${status.replace('_', ' ')}`,
        taskId: task._id,
        metadata: {
          updatedBy: req.user.name,
          oldStatus,
          newStatus: status,
          priority: task.priority
        }
      });
    }
  } else {
    console.log('⚠️ No status change detected - skipping notification');
  }

  // Broadcast task update to all organization members via Socket.IO
  try {
    const io = getIO();
    if (io) {
      io.to(`org-${task.organizationId}`).emit('task-updated', {
        task: task.toObject(),
        updatedBy: req.user.email,
        statusChanged,
        assignmentChanged
      });
      console.log(`📡 Broadcasted task-updated to organization: ${task.organizationId}`);
    }
  } catch (error) {
    console.error('Failed to broadcast task-updated:', error.message);
  }

  res.status(200).json({
    status: 'success',
    data: { task }
  });
});

/**
 * Delete task (soft delete)
 */
export const deleteTask = asyncHandler(async (req, res, next) => {
  const { taskId } = req.params;

  const task = await Task.findOne({
    _id: taskId,
    organizationId: req.organizationId,
    isDeleted: false
  });

  if (!task) {
    return next(new AppError('Task not found.', 404));
  }

  task.isDeleted = true;
  await task.save();

  // Broadcast task deletion to all organization members via Socket.IO
  try {
    const io = getIO();
    if (io) {
      io.to(`org-${task.organizationId}`).emit('task-deleted', {
        taskId: task._id,
        deletedBy: req.user.email
      });
      console.log(`📡 Broadcasted task-deleted to organization: ${task.organizationId}`);
    }
  } catch (error) {
    console.error('Failed to broadcast task-deleted:', error.message);
  }

  res.status(200).json({
    status: 'success',
    message: 'Task deleted successfully'
  });
});

/**
 * Upload attachment to task
 */
export const uploadAttachment = asyncHandler(async (req, res, next) => {
  const { taskId } = req.params;

  if (!req.file) {
    return next(new AppError('Please upload a file.', 400));
  }

  const filter = {
    _id: taskId,
    organizationId: req.organizationId,
    isDeleted: false
  };

  // Employees can only upload to their assigned tasks
  if (req.user.role === 'EMPLOYEE') {
    filter.assignedTo = { $in: [req.user._id] };
  }

  const task = await Task.findOne(filter);

  if (!task) {
    return next(new AppError('Task not found.', 404));
  }

  // Upload to Cloudinary
  const uploadStream = cloudinary.uploader.upload_stream(
    {
      folder: 'task-attachments',
      resource_type: 'auto'
    },
    async (error, result) => {
      if (error) {
        return next(new AppError('File upload failed.', 500));
      }

      // Add attachment to task
      task.attachments.push({
        fileName: req.file.originalname,
        fileUrl: result.secure_url,
        fileType: req.file.mimetype
      });

      await task.save();

      res.status(200).json({
        status: 'success',
        data: { task }
      });
    }
  );

  const readableStream = Readable.from(req.file.buffer);
  readableStream.pipe(uploadStream);
});

/**
 * Generate calendar ICS file for task
 */
export const generateCalendarFile = asyncHandler(async (req, res, next) => {
  const { taskId } = req.params;

  const task = await Task.findOne({
    _id: taskId,
    organizationId: req.organizationId,
    isDeleted: false
  }).populate('assignedTo', 'name email');

  if (!task) {
    return next(new AppError('Task not found.', 404));
  }

  if (!task.dueDate) {
    return next(new AppError('Task does not have a due date.', 400));
  }

  // Create calendar
  const calendar = ical({ name: 'Task Calendar' });

  calendar.createEvent({
    start: task.dueDate,
    end: task.dueDate,
    summary: task.title,
    description: task.description || '',
    location: '',
    url: ''
  });

  res.setHeader('Content-Type', 'text/calendar');
  res.setHeader('Content-Disposition', `attachment; filename="task-${task._id}.ics"`);
  res.send(calendar.toString());
});

/**
 * Get task statistics for dashboard
 */
export const getTaskStats = asyncHandler(async (req, res, next) => {
  const filter = {
    organizationId: req.organizationId,
    isDeleted: false
  };

  // Only ADMIN and SUPER_ADMIN see all stats
  // All other users (employees with any role name) see only their stats
  if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
    filter.assignedTo = { $in: [req.user._id] };
  }

  const [totalTasks, pendingTasks, inProgressTasks, completedTasks, overdueTasks] = await Promise.all([
    Task.countDocuments(filter),
    Task.countDocuments({ ...filter, status: 'PENDING' }),
    Task.countDocuments({ ...filter, status: 'IN_PROGRESS' }),
    Task.countDocuments({ ...filter, status: 'COMPLETED' }),
    Task.countDocuments({ ...filter, status: 'OVERDUE' })
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      stats: {
        total: totalTasks,
        pending: pendingTasks,
        inProgress: inProgressTasks,
        completed: completedTasks,
        overdue: overdueTasks
      }
    }
  });
});

/**
 * Accept task (Employee action)
 */
export const acceptTask = asyncHandler(async (req, res, next) => {
  const { taskId } = req.params;

  const task = await Task.findOne({
    _id: taskId,
    organizationId: req.organizationId,
    assignedTo: { $in: [req.user._id] },
    isDeleted: false
  });

  if (!task) {
    return next(new AppError('Task not found.', 404));
  }

  if (task.status !== 'PENDING') {
    return next(new AppError('Task can only be accepted when pending.', 400));
  }

  task.status = 'ACCEPTED';
  await task.save();
  await task.populate('assignedTo', 'name email');
  await task.populate('createdBy', 'name email');

  // TODO: Send notification to admin
  
  res.status(200).json({
    status: 'success',
    data: { task }
  });
});

/**
 * Start task (Employee action) - begins time tracking
 */
export const startTask = asyncHandler(async (req, res, next) => {
  const { taskId } = req.params;

  const task = await Task.findOne({
    _id: taskId,
    organizationId: req.organizationId,
    assignedTo: { $in: [req.user._id] },
    isDeleted: false
  });

  if (!task) {
    return next(new AppError('Task not found.', 404));
  }

  if (task.status !== 'ACCEPTED' && task.status !== 'PENDING') {
    return next(new AppError('Task must be accepted before starting.', 400));
  }

  task.status = 'IN_PROGRESS';
  task.startedAt = new Date();
  await task.save();
  await task.populate('assignedTo', 'name email');
  await task.populate('createdBy', 'name email');

  // Notify admin that task was started
  const admin = await User.findById(task.createdBy);
  if (admin) {
    await createNotification({
      organizationId: task.organizationId,
      userId: admin._id,
      type: 'TASK_UPDATED',
      message: `${req.user.name} started working on: ${task.title}`,
      taskId: task._id
    });
  }

  res.status(200).json({
    status: 'success',
    data: { task }
  });
});

/**
 * Submit task (Employee action) - marks as submitted with note
 */
export const submitTask = asyncHandler(async (req, res, next) => {
  const { taskId } = req.params;
  const { submissionNote } = req.body;

  const task = await Task.findOne({
    _id: taskId,
    organizationId: req.organizationId,
    assignedTo: { $in: [req.user._id] },
    isDeleted: false
  });

  if (!task) {
    return next(new AppError('Task not found.', 404));
  }

  if (task.status !== 'IN_PROGRESS') {
    return next(new AppError('Task must be in progress to submit.', 400));
  }

  task.status = 'SUBMITTED';
  task.submissionNote = submissionNote || '';
  await task.save();
  await task.populate('assignedTo', 'name email');
  await task.populate('createdBy', 'name email');

  // Notify admin that task was submitted
  const admin = await User.findById(task.createdBy);
  if (admin) {
    await createNotification({
      organizationId: task.organizationId,
      userId: admin._id,
      type: 'TASK_UPDATED',
      message: `${req.user.name} submitted task: ${task.title}`,
      taskId: task._id
    });
  }

  res.status(200).json({
    status: 'success',
    data: { task }
  });
});

/**
 * Complete task (Admin action) - approves submission
 */
export const completeTask = asyncHandler(async (req, res, next) => {
  const { taskId } = req.params;
  const { adminFeedback } = req.body;

  const task = await Task.findOne({
    _id: taskId,
    organizationId: req.organizationId,
    isDeleted: false
  });

  if (!task) {
    return next(new AppError('Task not found.', 404));
  }

  if (task.status !== 'SUBMITTED') {
    return next(new AppError('Only submitted tasks can be completed.', 400));
  }

  task.status = 'COMPLETED';
  task.adminFeedback = adminFeedback || '';
  await task.save();
  await task.populate('assignedTo', 'name email');
  await task.populate('createdBy', 'name email');

  // Notify all assigned employees that task was completed/approved
  const assignedToArray = Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo];
  for (const assignedUser of assignedToArray) {
    await createNotification({
      organizationId: task.organizationId,
      userId: assignedUser._id,
      type: 'TASK_COMPLETED',
      message: `Your task "${task.title}" was approved and completed!`,
      taskId: task._id
    });
  }

  res.status(200).json({
    status: 'success',
    data: { task }
  });
});

/**
 * Reject task (Admin action) - sends back for revision
 */
export const rejectTask = asyncHandler(async (req, res, next) => {
  const { taskId } = req.params;
  const { adminFeedback } = req.body;

  const task = await Task.findOne({
    _id: taskId,
    organizationId: req.organizationId,
    isDeleted: false
  });

  if (!task) {
    return next(new AppError('Task not found.', 404));
  }

  if (task.status !== 'SUBMITTED') {
    return next(new AppError('Only submitted tasks can be rejected.', 400));
  }

  task.status = 'REJECTED';
  task.adminFeedback = adminFeedback || '';
  await task.save();
  await task.populate('assignedTo', 'name email');
  await task.populate('createdBy', 'name email');

  // Notify all assigned employees that task was rejected
  const assignedToArray = Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo];
  for (const assignedUser of assignedToArray) {
    await createNotification({
      organizationId: task.organizationId,
      userId: assignedUser._id,
      type: 'TASK_UPDATED',
      message: `Your task "${task.title}" needs revision. Check feedback.`,
      taskId: task._id
    });
  }

  res.status(200).json({
    status: 'success',
    data: { task }
  });
});

/**
 * Add comment to task (Two-way communication)
 */
export const addComment = asyncHandler(async (req, res, next) => {
  const { taskId } = req.params;
  const { message } = req.body;

  if (!message || message.trim() === '') {
    return next(new AppError('Comment message is required.', 400));
  }

  const filter = {
    _id: taskId,
    organizationId: req.organizationId,
    isDeleted: false
  };

  // Employees can only comment on their assigned tasks
  if (req.user.role === 'EMPLOYEE') {
    filter.assignedTo = { $in: [req.user._id] };
  }

  const task = await Task.findOne(filter);

  if (!task) {
    return next(new AppError('Task not found.', 404));
  }

  task.comments.push({
    userId: req.user._id,
    message: message.trim()
  });

  await task.save();
  await task.populate('comments.userId', 'name email role');
  await task.populate('assignedTo', 'name email');
  await task.populate('createdBy', 'name email');

  // Notify the other party about new comment
  const notifyUserId = req.user.role === 'ADMIN' ? task.assignedTo._id : task.createdBy._id;
  const commentPreview = message.length > 50 ? message.substring(0, 50) + '...' : message;
  await createNotification({
    organizationId: task.organizationId,
    userId: notifyUserId,
    type: 'TASK_COMMENT',
    message: `${req.user.name} commented on "${task.title}": ${commentPreview}`,
    taskId: task._id
  });

  res.status(200).json({
    status: 'success',
    data: { task }
  });
});

export default {
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
};
