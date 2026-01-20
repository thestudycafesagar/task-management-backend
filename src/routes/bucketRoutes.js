import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  createBucket,
  getBuckets,
  getBucketById,
  updateBucket,
  deleteBucket
} from '../controllers/bucketController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Bucket routes
router.route('/')
  .get(getBuckets)
  .post(createBucket);

router.route('/:bucketId')
  .get(getBucketById)
  .patch(updateBucket)
  .delete(deleteBucket);

export default router;
