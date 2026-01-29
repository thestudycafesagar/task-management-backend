/**
 * Bucket Service
 * Business logic for bucket operations
 */
import Bucket from '../models/Bucket.js';
import Task from '../models/Task.js';
import AppError from '../utils/appError.js';

export const bucketService = {
  /**
   * Get all buckets in organization
   */
  async getBuckets(organizationId) {
    const buckets = await Bucket.find({
      organizationId,
      isDeleted: false
    }).sort({ order: 1, createdAt: -1 });

    return buckets;
  },

  /**
   * Get bucket by ID
   */
  async getBucketById(bucketId, organizationId) {
    const bucket = await Bucket.findOne({
      _id: bucketId,
      organizationId,
      isDeleted: false
    });

    if (!bucket) {
      throw new AppError('Bucket not found.', 404);
    }

    return bucket;
  },

  /**
   * Create new bucket
   */
  async createBucket(bucketData, organizationId, createdBy) {
    const { name, description, color } = bucketData;

    // Check for duplicate name
    const existingBucket = await Bucket.findOne({
      organizationId,
      name: { $regex: new RegExp(`^${name}$`, 'i') },
      isDeleted: false
    });

    if (existingBucket) {
      throw new AppError('Bucket with this name already exists.', 400);
    }

    const bucket = await Bucket.create({
      organizationId,
      name,
      description,
      color: color || '#3B82F6',
      createdBy
    });

    return bucket;
  },

  /**
   * Update bucket
   */
  async updateBucket(bucketId, updates, organizationId) {
    const bucket = await Bucket.findOne({
      _id: bucketId,
      organizationId,
      isDeleted: false
    });

    if (!bucket) {
      throw new AppError('Bucket not found.', 404);
    }

    // Check for duplicate name if name is being updated
    if (updates.name && updates.name !== bucket.name) {
      const existingBucket = await Bucket.findOne({
        organizationId,
        name: { $regex: new RegExp(`^${updates.name}$`, 'i') },
        isDeleted: false,
        _id: { $ne: bucketId }
      });

      if (existingBucket) {
        throw new AppError('Bucket with this name already exists.', 400);
      }
    }

    // Update allowed fields
    const allowedUpdates = ['name', 'description', 'color', 'order'];
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        bucket[field] = updates[field];
      }
    });

    await bucket.save();

    return bucket;
  },

  /**
   * Delete bucket
   */
  async deleteBucket(bucketId, organizationId) {
    const bucket = await Bucket.findOne({
      _id: bucketId,
      organizationId,
      isDeleted: false
    });

    if (!bucket) {
      throw new AppError('Bucket not found.', 404);
    }

    // Check if bucket has tasks
    const taskCount = await Task.countDocuments({
      bucketId,
      isDeleted: false
    });

    if (taskCount > 0) {
      throw new AppError('Cannot delete bucket with existing tasks. Please move or delete tasks first.', 400);
    }

    bucket.isDeleted = true;
    await bucket.save();

    return bucket;
  },

  /**
   * Get tasks in bucket
   */
  async getBucketTasks(bucketId, organizationId) {
    const bucket = await Bucket.findOne({
      _id: bucketId,
      organizationId,
      isDeleted: false
    });

    if (!bucket) {
      throw new AppError('Bucket not found.', 404);
    }

    const tasks = await Task.find({
      bucketId,
      organizationId,
      isDeleted: false
    })
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    return tasks;
  },

  /**
   * Get bucket statistics
   */
  async getBucketStats(bucketId, organizationId) {
    const bucket = await Bucket.findOne({
      _id: bucketId,
      organizationId,
      isDeleted: false
    });

    if (!bucket) {
      throw new AppError('Bucket not found.', 404);
    }

    const [totalTasks, completedTasks, inProgressTasks] = await Promise.all([
      Task.countDocuments({
        bucketId,
        organizationId,
        isDeleted: false
      }),
      Task.countDocuments({
        bucketId,
        organizationId,
        status: 'COMPLETED',
        isDeleted: false
      }),
      Task.countDocuments({
        bucketId,
        organizationId,
        status: 'IN_PROGRESS',
        isDeleted: false
      })
    ]);

    return {
      totalTasks,
      completedTasks,
      inProgressTasks,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
    };
  },
};
