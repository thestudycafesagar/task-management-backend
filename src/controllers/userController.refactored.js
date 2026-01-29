/**
 * User Controller (Refactored)
 * Handles HTTP request/response for user operations
 * Business logic delegated to userService
 */
import asyncHandler from '../utils/asyncHandler.js';
import { userService } from '../services/user.service.js';

/**
 * Get all employees in organization
 */
export const getEmployees = asyncHandler(async (req, res, next) => {
  const employees = await userService.getEmployees(req.organizationId);

  res.status(200).json({
    status: 'success',
    results: employees.length,
    data: { employees }
  });
});

/**
 * Get employee by ID
 */
export const getEmployeeById = asyncHandler(async (req, res, next) => {
  const employee = await userService.getEmployeeById(
    req.params.employeeId,
    req.organizationId
  );

  res.status(200).json({
    status: 'success',
    data: { employee }
  });
});

/**
 * Create employee
 */
export const createEmployee = asyncHandler(async (req, res, next) => {
  const employee = await userService.createEmployee(req.body, req.organizationId);

  res.status(201).json({
    status: 'success',
    data: { employee }
  });
});

/**
 * Update employee
 */
export const updateEmployee = asyncHandler(async (req, res, next) => {
  const employee = await userService.updateEmployee(
    req.params.employeeId,
    req.body,
    req.organizationId
  );

  res.status(200).json({
    status: 'success',
    data: { employee }
  });
});

/**
 * Delete employee (soft delete)
 */
export const deleteEmployee = asyncHandler(async (req, res, next) => {
  await userService.deleteEmployee(req.params.employeeId, req.organizationId);

  res.status(200).json({
    status: 'success',
    message: 'Employee deleted successfully'
  });
});

/**
 * Toggle employee active status
 */
export const toggleEmployeeStatus = asyncHandler(async (req, res, next) => {
  const employee = await userService.toggleEmployeeStatus(
    req.params.employeeId,
    req.organizationId
  );

  res.status(200).json({
    status: 'success',
    data: { employee }
  });
});

/**
 * Force change employee password (admin only)
 */
export const forceChangePassword = asyncHandler(async (req, res, next) => {
  const result = await userService.forceChangePassword(
    req.params.employeeId,
    req.body.newPassword,
    req.organizationId
  );

  res.status(200).json({
    status: 'success',
    message: result.message
  });
});

/**
 * Get employee performance stats
 */
export const getEmployeeStats = asyncHandler(async (req, res, next) => {
  const stats = await userService.getEmployeeStats(
    req.params.employeeId,
    req.organizationId
  );

  res.status(200).json({
    status: 'success',
    data: { stats }
  });
});

export default {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  toggleEmployeeStatus,
  forceChangePassword,
  getEmployeeStats
};
