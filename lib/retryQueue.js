/**
 * Retry Queue - Simple file-based queue for failed calls
 * 
 * Stores failed calls with retry scheduling
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const QUEUE_FILE = process.env.RETRY_QUEUE_PATH || path.join(process.cwd(), 'data', 'retry-queue.json');
const RETRY_INTERVALS = {
  'no-answer': 2 * 60 * 60 * 1000,    // 2 hours
  'busy': 30 * 60 * 1000,              // 30 minutes
  'failed': 15 * 60 * 1000             // 15 minutes (immediate retry after short wait)
};

class RetryQueue {
  constructor() {
    this.queue = [];
    this.ensureQueueFile();
    this.loadQueue();
  }

  ensureQueueFile() {
    const dir = path.dirname(QUEUE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(QUEUE_FILE)) {
      fs.writeFileSync(QUEUE_FILE, JSON.stringify([], null, 2));
    }
  }

  loadQueue() {
    try {
      const data = fs.readFileSync(QUEUE_FILE, 'utf8');
      this.queue = JSON.parse(data);
      logger.info(`Loaded ${this.queue.length} items from retry queue`);
    } catch (error) {
      logger.error('Failed to load retry queue', { error: error.message });
      this.queue = [];
    }
  }

  saveQueue() {
    try {
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(this.queue, null, 2));
    } catch (error) {
      logger.error('Failed to save retry queue', { error: error.message });
    }
  }

  /**
   * Add a call to the retry queue
   * @param {Object} callData - Call information
   * @param {string} reason - Why the call failed (no-answer, busy, failed)
   * @param {number} customDelayMs - Optional custom delay
   */
  add(callData, reason, customDelayMs = null) {
    const delayMs = customDelayMs || RETRY_INTERVALS[reason] || RETRY_INTERVALS.failed;
    const retryAt = new Date(Date.now() + delayMs);
    const retryCount = (callData.retryCount || 0) + 1;

    // Max retries: 3 for no-answer, 2 for busy, 1 for failed
    const maxRetries = reason === 'no-answer' ? 3 : reason === 'busy' ? 2 : 1;
    
    if (retryCount > maxRetries) {
      logger.warn(`Max retries exceeded for call`, { 
        callSid: callData.callSid,
        reason: reason,
        retryCount: retryCount
      });
      return { 
        success: false, 
        error: 'Max retries exceeded',
        maxRetriesExceeded: true
      };
    }

    const queueItem = {
      id: `retry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      callSid: callData.callSid,
      leadId: callData.leadId,
      phoneNumber: callData.phoneNumber,
      to: callData.to,
      from: callData.from,
      reason: reason,
      originalAttemptAt: callData.originalAttemptAt || new Date().toISOString(),
      retryAt: retryAt.toISOString(),
      retryCount: retryCount,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    this.queue.push(queueItem);
    this.saveQueue();

    logger.info(`Call scheduled for retry`, {
      id: queueItem.id,
      callSid: callData.callSid,
      reason: reason,
      retryAt: retryAt.toISOString(),
      retryCount: retryCount
    });

    return {
      success: true,
      id: queueItem.id,
      retryAt: retryAt.toISOString(),
      retryCount: retryCount
    };
  }

  /**
   * Get all items ready to retry
   * @returns {Array} - Items ready for retry
   */
  getReadyForRetry() {
    const now = new Date().toISOString();
    return this.queue.filter(item => 
      item.status === 'pending' && 
      item.retryAt <= now
    );
  }

  /**
   * Mark an item as completed
   * @param {string} id - Queue item ID
   */
  markCompleted(id) {
    const item = this.queue.find(q => q.id === id);
    if (item) {
      item.status = 'completed';
      item.completedAt = new Date().toISOString();
      this.saveQueue();
      logger.info(`Retry item marked completed`, { id });
    }
  }

  /**
   * Mark an item as failed (will retry again if under max)
   * @param {string} id - Queue item ID
   * @param {string} error - Error message
   */
  markFailed(id, error) {
    const item = this.queue.find(q => q.id === id);
    if (item) {
      item.status = 'pending';
      item.lastError = error;
      // Exponential backoff: double the delay
      const currentDelay = new Date(item.retryAt) - new Date(item.createdAt);
      const newRetryAt = new Date(Date.now() + (currentDelay * 2));
      item.retryAt = newRetryAt.toISOString();
      this.saveQueue();
      logger.info(`Retry item re-scheduled with backoff`, { id, newRetryAt: item.retryAt });
    }
  }

  /**
   * Mark an item as permanently failed
   * @param {string} id - Queue item ID
   * @param {string} reason - Reason for permanent failure
   */
  markPermanentlyFailed(id, reason) {
    const item = this.queue.find(q => q.id === id);
    if (item) {
      item.status = 'permanently_failed';
      item.failureReason = reason;
      item.failedAt = new Date().toISOString();
      this.saveQueue();
      logger.warn(`Retry item permanently failed`, { id, reason });
    }
  }

  /**
   * Remove an item from the queue
   * @param {string} id - Queue item ID
   */
  remove(id) {
    const initialLength = this.queue.length;
    this.queue = this.queue.filter(q => q.id !== id);
    if (this.queue.length < initialLength) {
      this.saveQueue();
      logger.info(`Retry item removed from queue`, { id });
    }
  }

  /**
   * Get queue statistics
   * @returns {Object} - Queue stats
   */
  getStats() {
    const stats = {
      total: this.queue.length,
      pending: this.queue.filter(q => q.status === 'pending').length,
      completed: this.queue.filter(q => q.status === 'completed').length,
      permanentlyFailed: this.queue.filter(q => q.status === 'permanently_failed').length,
      readyForRetry: this.getReadyForRetry().length
    };
    return stats;
  }

  /**
   * Clean up old completed items (older than 7 days)
   */
  cleanup() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const initialLength = this.queue.length;
    this.queue = this.queue.filter(q => {
      if (q.status === 'completed' || q.status === 'permanently_failed') {
        const itemDate = new Date(q.completedAt || q.failedAt || q.createdAt);
        return itemDate > sevenDaysAgo;
      }
      return true;
    });
    
    if (this.queue.length < initialLength) {
      this.saveQueue();
      logger.info(`Cleaned up ${initialLength - this.queue.length} old queue items`);
    }
  }

  /**
   * Process the retry queue
   * @param {Function} processor - Async function to process each item
   */
  async processQueue(processor) {
    const readyItems = this.getReadyForRetry();
    
    if (readyItems.length === 0) {
      return { processed: 0 };
    }

    logger.info(`Processing ${readyItems.length} retry items`);
    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      permanentlyFailed: 0
    };

    for (const item of readyItems) {
      try {
        item.status = 'processing';
        this.saveQueue();

        const result = await processor(item);

        if (result.success) {
          this.markCompleted(item.id);
          results.succeeded++;
        } else if (result.permanent) {
          this.markPermanentlyFailed(item.id, result.error || 'Permanent failure');
          results.permanentlyFailed++;
        } else {
          this.markFailed(item.id, result.error || 'Processing failed');
          results.failed++;
        }
      } catch (error) {
        logger.error(`Error processing retry item`, { id: item.id, error: error.message });
        this.markFailed(item.id, error.message);
        results.failed++;
      }
      results.processed++;
    }

    logger.info(`Retry queue processing complete`, results);
    return results;
  }
}

// Singleton instance
let queueInstance = null;

function getRetryQueue() {
  if (!queueInstance) {
    queueInstance = new RetryQueue();
  }
  return queueInstance;
}

module.exports = { RetryQueue, getRetryQueue, RETRY_INTERVALS };