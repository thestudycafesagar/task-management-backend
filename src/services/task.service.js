/**
 * Task Service
 * Business logic for task operations
 */
import Task from '../models/Task.js';
import User from '../models/User.js';
import AppError from '../utils/appError.js';
import { notifyTaskAssigned, createNotification } from './notificationService.js';
import { getIO } from './socket.js';
import logger from '../utils/logger.js';

/**
 * Check if user has admin privileges
 */
const hasAdminPrivileges = (user, isImpersonating) => {
  return user.role === 'ADMIN' || 
         user.role === 'SUPER_ADMIN' || 
         (isImpersonating && user.role === 'SUPER_ADMIN');
};

export const taskService = {
  /**
   * Get tasks with filters
   */
  async getTasks(organizationId, user, isImpersonating, filters = {}) {
    const filter = {
      organizationId,
      isDeleted: false
    };

    if (filters.status) filter.status = filters.status;
    if (filters.priority) filter.priority = filters.priority;
    if (filters.assignedTo) filter.assignedTo = filters.assignedTo;

    // Add search filter
    if (filters.search) {
      filter.$or = [
        { title: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } }
      ];
    }

    // Employees can only see their assigned tasks
    if (!hasAdminPrivileges(user, isImpersonating)) {
      filter.assignedTo = { $in: [user._id] };
    }

    const tasks = await Task.find(filter)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .populate('bucketId', 'name')
      .sort({ createdAt: -1 });

    // For employees, filter and add individual status
    if (!hasAdminPrivileges(user, isImpersonating)) {
      tasks.forEach(task => {
        task.assignedTo = task.assignedTo.filter(u => u._id.toString() === user._id.toString());
        
        const employeeStatus = task.employeeStatus.find(
          es => es.employeeId.toString() === user._id.toString()
        );
        if (employeeStatus) {
          task._doc.myStatus = employeeStatus.status;
        }
      });
    }

    return tasks;
  },

  /**
   * Get task by ID
   */
  async getTaskById(taskId, organizationId, user, isImpersonating) {
    const filter = {
      _id: taskId,
      organizationId,
      isDeleted: false
    };

    // Employees can only view their assigned tasks
    if (!hasAdminPrivileges(user, isImpersonating)) {
      filter.assignedTo = { $in: [user._id] };
    }

    const task = await Task.findOne(filter)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .populate('bucketId', 'name');

    if (!task) {
      throw new AppError('Task not found.', 404);
    }

    // For employees, filter and add individual status
    if (!hasAdminPrivileges(user, isImpersonating)) {
      task.assignedTo = task.assignedTo.filter(u => u._id.toString() === user._id.toString());
      
      const employeeStatus = task.employeeStatus.find(
        es => es.employeeId.toString() === user._id.toString()
      );
      if (employeeStatus) {
        task._doc.myStatus = employeeStatus.status;
      }
    }

    return task;
  },

  /**
   * Create new task
   */
  async createTask(taskData, organizationId, createdBy) {
    const { title, description, priority, dueDate, assignedTo, bucketId } = taskData;

    const assignedToArray = Array.isArray(assignedTo) ? assignedTo : [assignedTo];

    // Verify assigned users
    const assignedUsers = await User.find({
      _id: { $in: assignedToArray },
      organizationId,
      isActive: true
    });

    if (assignedUsers.length !== assignedToArray.length) {
      throw new AppError('One or more assigned users not found in organization.', 404);
    }

    const task = await Task.create({
      organizationId,
      title,
      description,
      priority,
      dueDate: dueDate || null,
      assignedTo: assignedToArray,
      createdBy,
      bucketId: bucketId || null
    });

    await task.populate('assignedTo', 'name email');
    await task.populate('createdBy', 'name email');
    await task.populate('bucketId', 'name');

    // Send notifications
    for (const assignedUser of assignedUsers) {
      await notifyTaskAssigned(task, assignedUser);
    }

    // Broadcast via Socket.IO
    try {
      const io = getIO();
      if (io) {
        io.to(`org-${task.organizationId}`).emit('task-created', {
          task: task.toObject(),
          createdBy: createdBy.email
        });
      }
    } catch (error) {
      logger.error('Failed to broadcast task-created:', error.message);
    }

    return task;
  },

  /**
   * Update task
   */
  async updateTask(taskId, updates, organizationId, user, isImpersonating) {
    const filter = {
      _id: taskId,
      organizationId,
      isDeleted: false
    };

    // Employees can only update their assigned tasks
    if (!hasAdminPrivileges(user, isImpersonating)) {
      filter.assignedTo = { $in: [user._id] };
    }

    const task = await Task.findOne(filter);
    if (!task) {
      throw new AppError('Task not found.', 404);
    }

    const oldStatus = task.status;
    const oldAssignedToIds = task.assignedTo.map(id => id.toString());
    
    let statusChanged = false;
    let assignmentChanged = false;
    let newAssignees = [];

    // Only admins can update certain fields
    if (hasAdminPrivileges(user, isImpersonating)) {
      const allowedUpdates = ['title', 'description', 'priority', 'dueDate', 'status', 'assignedTo', 'bucketId'];
      allowedUpdates.forEach(field => {
        if (updates[field] !== undefined) {
          if (field === 'status') {
            statusChanged = updates.status !== oldStatus;
          }
          task[field] = updates[field];
        }
      });

      // Handle assignment changes
      if (updates.assignedTo) {
        const assignedToArray = Array.isArray(updates.assignedTo) ? updates.assignedTo : [updates.assignedTo];
        const assignedUsers = await User.find({
          _id: { $in: assignedToArray },
          organizationId,
          isActive: true
        });
        
        if (assignedUsers.length !== assignedToArray.length) {
          throw new AppError('One or more assigned users not found in organization.', 404);
        }
        
        const newAssignedToIds = assignedToArray.map(id => id.toString());
        assignmentChanged = JSON.stringify(oldAssignedToIds.sort()) !== JSON.stringify(newAssignedToIds.sort());
        
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
    await task.populate('bucketId', 'name');

    // Send notifications for new assignees
    if (assignmentChanged && newAssignees.length > 0) {
      for (const assignedUser of newAssignees) {
        await notifyTaskAssigned(task, assignedUser);
      }
    }

    // Send status change notifications
    if (statusChanged) {
      await this.sendStatusChangeNotifications(task, user, isImpersonating, oldStatus, updates.status);
    }

    // Broadcast update
    try {
      const io = getIO();
      if (io) {
        io.to(`org-${task.organizationId}`).emit('task-updated', {
          task: task.toObject(),
          updatedBy: user.email
        });
      }
    } catch (error) {
      logger.error('Failed to broadcast task-updated:', error.message);
    }

    return task;
  },

  /**
   * Delete task
   */
  async deleteTask(taskId, organizationId, user, isImpersonating) {
    if (!hasAdminPrivileges(user, isImpersonating)) {
      throw new AppError('Only admins can delete tasks.', 403);
    }

    const task = await Task.findOne({
      _id: taskId,
      organizationId,
      isDeleted: false
    });

    if (!task) {
      throw new AppError('Task not found.', 404);
    }

    task.isDeleted = true;
    await task.save();

    // Broadcast deletion
    try {
      const io = getIO();
      if (io) {
        io.to(`org-${task.organizationId}`).emit('task-deleted', {
          taskId: task._id,
          deletedBy: user.email
        });
      }
    } catch (error) {
      logger.error('Failed to broadcast task-deleted:', error.message);
    }

    return task;
  },

  /**
   * Get task statistics
   */
  async getTaskStats(organizationId, user, isImpersonating) {
    const filter = {
      organizationId,
      isDeleted: false
    };

    // Employees see only their stats
    if (!hasAdminPrivileges(user, isImpersonating)) {
      filter.assignedTo = { $in: [user._id] };
    }

    const [total, inProgress, completed, overdue] = await Promise.all([
      Task.countDocuments(filter),
      Task.countDocuments({ ...filter, status: 'IN_PROGRESS' }),
      Task.countDocuments({ ...filter, status: 'COMPLETED' }),
      Task.countDocuments({ 
        ...filter, 
        dueDate: { $lt: new Date() },
        status: { $nin: ['COMPLETED', 'CANCELLED'] }
      })
    ]);

    return { total, inProgress, completed, overdue };
  },

  /**
   * Send status change notifications
   */
  async sendStatusChangeNotifications(task, user, isImpersonating, oldStatus, newStatus) {
    const updaterName = user.name || user.email.split('@')[0];
    const statusEmoji = {
      'TODO': '📋',
      'IN_PROGRESS': '🔄',
      'COMPLETED': '✅',
      'CANCELLED': '❌'
    };

    if (hasAdminPrivileges(user, isImpersonating)) {
      // Notify all assigned employees
      const assignedToArray = Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo];
      
      for (const assignedUser of assignedToArray) {
        await createNotification({
          organizationId: task.organizationId,
          userId: assignedUser._id,
          type: 'TASK_UPDATED',
          message: `${statusEmoji[newStatus] || '📝'} ${updaterName} changed "${task.title}" status to ${newStatus.replace('_', ' ')}`,
          taskId: task._id,
          metadata: {
            updatedBy: user.name,
            oldStatus,
            newStatus,
            priority: task.priority
          }
        });
      }
    } else {
      // Notify admin/creator
      await createNotification({
        organizationId: task.organizationId,
        userId: task.createdBy._id,
        type: 'TASK_UPDATED',
        message: `${statusEmoji[newStatus] || '📝'} ${updaterName} changed "${task.title}" status to ${newStatus.replace('_', ' ')}`,
        taskId: task._id,
        metadata: {
          updatedBy: user.name,
          oldStatus,
          newStatus,
          priority: task.priority
        }
      });
    }
  },
};
