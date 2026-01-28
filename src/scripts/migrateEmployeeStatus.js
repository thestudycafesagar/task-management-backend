import mongoose from 'mongoose';
import Task from '../models/Task.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Migration script to add employeeStatus array to existing tasks
 * Run this once after deploying the new Task model
 */
const migrateExistingTasks = async () => {
  try {
    console.log('🔄 Starting migration: Adding employeeStatus to existing tasks...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all tasks that don't have employeeStatus or have empty employeeStatus
    const tasksToMigrate = await Task.find({
      $or: [
        { employeeStatus: { $exists: false } },
        { employeeStatus: { $size: 0 } }
      ]
    });

    console.log(`📊 Found ${tasksToMigrate.length} tasks to migrate`);

    let migrated = 0;
    let skipped = 0;

    for (const task of tasksToMigrate) {
      if (!task.assignedTo || task.assignedTo.length === 0) {
        console.log(`⚠️ Skipping task ${task._id} - no assignedTo users`);
        skipped++;
        continue;
      }

      // Initialize employeeStatus based on current task status and assignedTo
      task.employeeStatus = task.assignedTo.map(employeeId => {
        const empStatus = {
          employeeId: employeeId,
          status: task.status === 'OVERDUE' ? 'PENDING' : task.status
        };

        // Copy over timestamps based on current status
        if (task.status === 'ACCEPTED' && task.acceptedAt) {
          empStatus.acceptedAt = task.acceptedAt;
        }
        if (task.status === 'IN_PROGRESS' && task.startedAt) {
          empStatus.startedAt = task.startedAt;
        }
        if (task.status === 'SUBMITTED' && task.submittedAt) {
          empStatus.submittedAt = task.submittedAt;
          empStatus.submissionNote = task.submissionNote;
        }
        if (task.status === 'COMPLETED' && task.completedAt) {
          empStatus.completedAt = task.completedAt;
        }

        return empStatus;
      });

      await task.save();
      migrated++;
      
      if (migrated % 10 === 0) {
        console.log(`✅ Migrated ${migrated}/${tasksToMigrate.length} tasks...`);
      }
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Tasks migrated: ${migrated}`);
    console.log(`   - Tasks skipped: ${skipped}`);
    console.log(`   - Total processed: ${tasksToMigrate.length}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

// Run migration
migrateExistingTasks();
