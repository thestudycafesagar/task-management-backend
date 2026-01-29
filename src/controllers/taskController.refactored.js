/**
 * Task Controller (Refactored)
 * Handles HTTP request/response for task operations
 * Business logic delegated to taskService
 */
import asyncHandler from '../utils/asyncHandler.js';
import { taskService } from '../services/task.service.js';

/**
 * Get all tasks with filters
 */
export const getTasks = asyncHandler(async (req, res, next) => {
  const tasks = await taskService.getTasks(
    req.organizationId,
    req.user,
    req.isImpersonating,
    req.query
  );

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
  const task = await taskService.getTaskById(
    req.params.taskId,
    req.organizationId,
    req.user,
    req.isImpersonating
  );

  res.status(200).json({
    status: 'success',
    data: { task }
  });
});

/**
 * Create task (Admin only)
 */
export const createTask = asyncHandler(async (req, res, next) => {
  const task = await taskService.createTask(
    req.body,
    req.organizationId,
    req.user._id
  );

  res.status(201).json({
    status: 'success',
    data: { task }
  });
});

/**
 * Update task
 */
export const updateTask = asyncHandler(async (req, res, next) => {
  const task = await taskService.updateTask(
    req.params.taskId,
    req.body,
    req.organizationId,
    req.user,
    req.isImpersonating
  );

  res.status(200).json({
    status: 'success',
    data: { task }
  });
});

/**
 * Delete task (Admin only)
 */
export const deleteTask = asyncHandler(async (req, res, next) => {
  await taskService.deleteTask(
    req.params.taskId,
    req.organizationId,
    req.user,
    req.isImpersonating
  );

  res.status(200).json({
    status: 'success',
    message: 'Task deleted successfully'
  });
});

/**
 * Get task statistics
 */
export const getTaskStats = asyncHandler(async (req, res, next) => {
  const stats = await taskService.getTaskStats(
    req.organizationId,
    req.user,
    req.isImpersonating
  );

  res.status(200).json({
    status: 'success',
    data: { stats }
  });
});

/**
 * Update task status (employee)
 */
export const updateTaskStatus = asyncHandler(async (req, res, next) => {
  const task = await taskService.updateTask(
    req.params.taskId,
    { status: req.body.status },
    req.organizationId,
    req.user,
    req.isImpersonating
  );

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
  getTaskStats,
  updateTaskStatus
};
