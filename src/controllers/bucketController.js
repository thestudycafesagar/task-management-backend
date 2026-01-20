import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/appError.js';
import Bucket from '../models/Bucket.js';

/**
 * Check if user has admin privileges
 */
const hasAdminPrivileges = (req) => {
  return req.user.role === 'ADMIN' || 
         req.user.role === 'SUPER_ADMIN' || 
         (req.isImpersonating && req.user.role === 'SUPER_ADMIN');
};

/**
 * Create a new bucket
 * @access Admin only
 */
export const createBucket = asyncHandler(async (req, res, next) => {
  // Only admins can create buckets
  if (!hasAdminPrivileges(req)) {
    return next(new AppError('Only admins can create buckets', 403));
  }

  const { name } = req.body;

  if (!name || !name.trim()) {
    return next(new AppError('Bucket name is required', 400));
  }

  // Check if bucket with same name already exists in organization
  const existingBucket = await Bucket.findOne({
    organizationId: req.organizationId,
    name: name.trim(),
    isDeleted: false
  });

  if (existingBucket) {
    return next(new AppError('A bucket with this name already exists', 400));
  }

  const bucket = await Bucket.create({
    organizationId: req.organizationId,
    name: name.trim(),
    createdBy: req.user._id
  });

  await bucket.populate('createdBy', 'name email');

  res.status(201).json({
    status: 'success',
    data: { bucket }
  });
});

/**
 * Get all buckets for organization
 * @access Authenticated users
 */
export const getBuckets = asyncHandler(async (req, res, next) => {
  const { search } = req.query;

  const filter = {
    organizationId: req.organizationId,
    isDeleted: false
  };

  // Add search filter
  if (search) {
    filter.name = { $regex: search, $options: 'i' };
  }

  const buckets = await Bucket.find(filter)
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    results: buckets.length,
    data: { buckets }
  });
});

/**
 * Get bucket by ID
 * @access Authenticated users
 */
export const getBucketById = asyncHandler(async (req, res, next) => {
  const { bucketId } = req.params;

  const bucket = await Bucket.findOne({
    _id: bucketId,
    organizationId: req.organizationId,
    isDeleted: false
  }).populate('createdBy', 'name email');

  if (!bucket) {
    return next(new AppError('Bucket not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { bucket }
  });
});

/**
 * Update bucket
 * @access Admin only
 */
export const updateBucket = asyncHandler(async (req, res, next) => {
  // Only admins can update buckets
  if (!hasAdminPrivileges(req)) {
    return next(new AppError('Only admins can update buckets', 403));
  }

  const { bucketId } = req.params;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return next(new AppError('Bucket name is required', 400));
  }

  // Check if bucket exists
  const bucket = await Bucket.findOne({
    _id: bucketId,
    organizationId: req.organizationId,
    isDeleted: false
  });

  if (!bucket) {
    return next(new AppError('Bucket not found', 404));
  }

  // Check if new name conflicts with existing bucket
  if (name.trim() !== bucket.name) {
    const existingBucket = await Bucket.findOne({
      organizationId: req.organizationId,
      name: name.trim(),
      isDeleted: false,
      _id: { $ne: bucketId }
    });

    if (existingBucket) {
      return next(new AppError('A bucket with this name already exists', 400));
    }
  }

  bucket.name = name.trim();
  await bucket.save();
  await bucket.populate('createdBy', 'name email');

  res.status(200).json({
    status: 'success',
    data: { bucket }
  });
});

/**
 * Delete bucket (soft delete)
 * @access Admin only
 */
export const deleteBucket = asyncHandler(async (req, res, next) => {
  // Only admins can delete buckets
  if (!hasAdminPrivileges(req)) {
    return next(new AppError('Only admins can delete buckets', 403));
  }

  const { bucketId } = req.params;

  const bucket = await Bucket.findOne({
    _id: bucketId,
    organizationId: req.organizationId,
    isDeleted: false
  });

  if (!bucket) {
    return next(new AppError('Bucket not found', 404));
  }

  bucket.isDeleted = true;
  await bucket.save();

  res.status(200).json({
    status: 'success',
    message: 'Bucket deleted successfully'
  });
});
