/**
 * User Service
 * Business logic for user/employee operations
 */
import User from '../models/User.js';
import AppError from '../utils/appError.js';
import cloudinary from '../config/cloudinary.js';

export const userService = {
  /**
   * Get all employees in organization
   */
  async getEmployees(organizationId) {
    const employees = await User.find({
      organizationId,
      isDeleted: false
    }).select('-password').sort({ createdAt: -1 });

    return employees;
  },

  /**
   * Get employee by ID
   */
  async getEmployeeById(userId, organizationId) {
    const user = await User.findOne({
      _id: userId,
      organizationId,
      isDeleted: false
    }).select('-password');

    if (!user) {
      throw new AppError('User not found.', 404);
    }

    return user;
  },

  /**
   * Create new employee
   */
  async createEmployee(employeeData, organizationId) {
    const { name, email, password, role } = employeeData;

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new AppError('Email already registered.', 400);
    }

    const employee = await User.create({
      organizationId,
      name,
      email,
      password,
      role: role || 'EMPLOYEE'
    });

    // Remove password from response
    employee.password = undefined;

    return employee;
  },

  /**
   * Update employee
   */
  async updateEmployee(userId, updates, organizationId) {
    const user = await User.findOne({
      _id: userId,
      organizationId,
      isDeleted: false
    });

    if (!user) {
      throw new AppError('User not found.', 404);
    }

    // Check for duplicate email if email is being updated
    if (updates.email && updates.email !== user.email) {
      const existingUser = await User.findOne({ 
        email: updates.email,
        _id: { $ne: userId }
      });
      if (existingUser) {
        throw new AppError('Email already in use.', 400);
      }
    }

    // Update allowed fields
    const allowedUpdates = ['name', 'email', 'role'];
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        user[field] = updates[field];
      }
    });

    await user.save();
    user.password = undefined;

    return user;
  },

  /**
   * Delete employee (soft delete)
   */
  async deleteEmployee(userId, organizationId) {
    const user = await User.findOne({
      _id: userId,
      organizationId,
      isDeleted: false
    });

    if (!user) {
      throw new AppError('User not found.', 404);
    }

    // Prevent deletion of the last admin
    if (user.role === 'ADMIN') {
      const adminCount = await User.countDocuments({
        organizationId,
        role: 'ADMIN',
        isDeleted: false
      });

      if (adminCount === 1) {
        throw new AppError('Cannot delete the last admin.', 400);
      }
    }

    user.isDeleted = true;
    user.isActive = false;
    await user.save();

    return user;
  },

  /**
   * Toggle employee active status
   */
  async toggleEmployeeStatus(userId, organizationId) {
    const user = await User.findOne({
      _id: userId,
      organizationId,
      isDeleted: false
    });

    if (!user) {
      throw new AppError('User not found.', 404);
    }

    user.isActive = !user.isActive;
    await user.save();

    return user;
  },

  /**
   * Force change employee password (admin only)
   */
  async forceChangePassword(userId, newPassword, organizationId) {
    const user = await User.findOne({
      _id: userId,
      organizationId,
      isDeleted: false
    });

    if (!user) {
      throw new AppError('User not found.', 404);
    }

    user.password = newPassword;
    await user.save();

    return { message: 'Password changed successfully' };
  },

  /**
   * Update profile picture
   */
  async updateProfilePicture(userId, file, organizationId) {
    const user = await User.findOne({
      _id: userId,
      organizationId,
      isDeleted: false
    });

    if (!user) {
      throw new AppError('User not found.', 404);
    }

    // Delete old image if exists
    if (user.profilePicture) {
      try {
        const publicId = user.profilePicture.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`profile-pictures/${publicId}`);
      } catch (error) {
        console.error('Error deleting old profile picture:', error);
      }
    }

    // Upload new image
    const result = await cloudinary.uploader.upload(file.path, {
      folder: 'profile-pictures',
      transformation: [
        { width: 200, height: 200, crop: 'fill' }
      ]
    });

    user.profilePicture = result.secure_url;
    await user.save();

    return user;
  },

  /**
   * Get employee performance stats
   */
  async getEmployeeStats(userId, organizationId) {
    const Task = (await import('../models/Task.js')).default;

    const [totalTasks, completedTasks, inProgressTasks, overdueTasks] = await Promise.all([
      Task.countDocuments({
        organizationId,
        assignedTo: { $in: [userId] },
        isDeleted: false
      }),
      Task.countDocuments({
        organizationId,
        assignedTo: { $in: [userId] },
        status: 'COMPLETED',
        isDeleted: false
      }),
      Task.countDocuments({
        organizationId,
        assignedTo: { $in: [userId] },
        status: 'IN_PROGRESS',
        isDeleted: false
      }),
      Task.countDocuments({
        organizationId,
        assignedTo: { $in: [userId] },
        dueDate: { $lt: new Date() },
        status: { $nin: ['COMPLETED', 'CANCELLED'] },
        isDeleted: false
      })
    ]);

    return {
      totalTasks,
      completedTasks,
      inProgressTasks,
      overdueTasks,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
    };
  },
};
