/**
 * Bucket Controller (Refactored)
 * Handles HTTP request/response for bucket operations
 * Business logic delegated to bucketService
 */
import asyncHandler from '../utils/asyncHandler.js';
import { bucketService } from '../services/bucket.service.js';

/**
 * Get all buckets
 */
export const getBuckets = asyncHandler(async (req, res, next) => {
  const buckets = await bucketService.getBuckets(req.organizationId);

  res.status(200).json({
    status: 'success',
    results: buckets.length,
    data: { buckets }
  });
});

/**
 * Get bucket by ID
 */
export const getBucketById = asyncHandler(async (req, res, next) => {
  const bucket = await bucketService.getBucketById(
    req.params.bucketId,
    req.organizationId
  );

  res.status(200).json({
    status: 'success',
    data: { bucket }
  });
});

/**
 * Create bucket
 */
export const createBucket = asyncHandler(async (req, res, next) => {
  const bucket = await bucketService.createBucket(
    req.body,
    req.organizationId,
    req.user._id
  );

  res.status(201).json({
    status: 'success',
    data: { bucket }
  });
});

/**
 * Update bucket
 */
export const updateBucket = asyncHandler(async (req, res, next) => {
  const bucket = await bucketService.updateBucket(
    req.params.bucketId,
    req.body,
    req.organizationId
  );

  res.status(200).json({
    status: 'success',
    data: { bucket }
  });
});

/**
 * Delete bucket
 */
export const deleteBucket = asyncHandler(async (req, res, next) => {
  await bucketService.deleteBucket(req.params.bucketId, req.organizationId);

  res.status(200).json({
    status: 'success',
    message: 'Bucket deleted successfully'
  });
});

/**
 * Get tasks in bucket
 */
export const getBucketTasks = asyncHandler(async (req, res, next) => {
  const tasks = await bucketService.getBucketTasks(
    req.params.bucketId,
    req.organizationId
  );

  res.status(200).json({
    status: 'success',
    results: tasks.length,
    data: { tasks }
  });
});

/**
 * Get bucket statistics
 */
export const getBucketStats = asyncHandler(async (req, res, next) => {
  const stats = await bucketService.getBucketStats(
    req.params.bucketId,
    req.organizationId
  );

  res.status(200).json({
    status: 'success',
    data: { stats }
  });
});

export default {
  getBuckets,
  getBucketById,
  createBucket,
  updateBucket,
  deleteBucket,
  getBucketTasks,
  getBucketStats
};
