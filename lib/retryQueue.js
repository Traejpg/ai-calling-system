/**
 * Retry Queue - File-based queue for failed calls with bad number handling
 * 
 * Features:
 * - Retry failed calls up to 2 times with 15-minute delays
 * - After max retries, mark as "Bad Number"
 * - Separate handling for different failure types
 */

const fs = require('fs');
const path = require('path');
const logger = require('../src/utils/logger');

const QUEUE_FILE = process.env.RETRY_QUEUE_PATH || path.join(process.cwd(), 'data', 'retry-queue.json');
const BAD_NUMBERS_FILE = process.env.BAD_NUMBERS_PATH || path.join(process.cwd(), 'data', 'bad-numbers.json');

// Retry intervals in milliseconds
const RETRY_INTERVALS = {
  'no-answer': 15 * 60 * 1000,      // 15 minutes
  'busy': 15 * 60 * 1000,           // 15 minutes
  'failed': 15 * 60 * 1000,         // 15 minutes
  'disconnected': 15 * 60 * 1000,   // 15 minutes (bad number candidate)
  'invalid': 15 * 60 * 1000,        // 15 minutes (bad number candidate)
  'voicemail-left': 60 * 60 * 1000  // 1 hour (if we want to retry voicemail)
};

// Max retries: 2 for all failure types
const MAX_RETRIES = 2;

class RetryQueue {
  constructor() {
    this.queue = [];
    this.badNumbers = new Set();
    this.ensureQueueFile();
    this.ensureBadNumbersFile();
    this.loadQueue();
    this.loadBadNumbers();
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

  ensureBadNumbersFile() {
    const dir = path.dirname(BAD_NUMBERS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(BAD_NUMBERS_FILE)) {
      fs.writeFileSync(BAD_NUMBERS_FILE, JSON.stringify({
        badNumbers: [],
        updatedAt: new Date().toISOString()
      }, null, 2));
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

  loadBadNumbers() {
    try {
      const data = fs.readFileSync(BAD_NUMBERS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      this.badNumbers = new Set(parsed.badNumbers || []);
      logger.info(`Loaded ${this.badNumbers.size} bad numbers`);
    } catch (error) {
      logger.error('Failed to load bad numbers', { error: error.message });
      this.badNumbers = new Set();
    }
  }

  saveQueue() {
    try {
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(this.queue, null, 2));
    } catch (error) {
      logger.error('Failed to save retry queue', { error: error.message });
    }
  }

  saveBadNumbers() {
    try {
      const data = {
        badNumbers: Array.from(this.badNumbers),
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(BAD_NUMBERS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error('Failed to save bad numbers', { error: error.message });
    }
  }

  /**
   * Check if a phone number is marked as bad
   * @param {string} phoneNumber - Phone number to check
   * @returns {boolean} - True if bad number
   */
  isBadNumber(phoneNumber) {
    const normalized = this.normalizePhone(phoneNumber);
    return this.badNumbers.has(normalized);
  }

  /**
   * Mark a phone number as bad
   * @param {string} phoneNumber - Phone number to mark
   * @param {string} reason - Why it's marked as bad
   * @param {string} leadId - Associated lead ID
   */
  markBadNumber(phoneNumber, reason = 'Max retries exceeded', leadId = null) {
    const normalized = this.normalizePhone(phoneNumber);
    
    if (this.badNumbers.has(normalized)) {
      return { alreadyMarked: true };
    }

    this.badNumbers.add(normalized);
    this.saveBadNumbers();

    logger.warn('Phone number marked as bad', {
      phoneNumber: normalized,
      reason,
      leadId
    });

    return {
      success: true,
      phoneNumber: normalized,
      reason,
      leadId
    };
  }

  /**
   * Normalize phone number for consistent comparison
   * @param {string} phone - Raw phone number
   * @returns {string} - Normalized phone number
   */
  normalizePhone(phone) {
    if (!phone) return '';
    // Remove all non-digit characters
    let digits = phone.replace(/\D/g, '');
    // Remove leading 1 for US numbers
    if (digits.length === 11 && digits.startsWith('1')) {
      digits = digits.substring(1);
    }
    return digits;
  }

  /**
   * Add a call to the retry queue
   * @param {Object} callData - Call information
   * @param {string} reason - Why the call failed (no-answer, busy, failed, disconnected, invalid)
   * @param {number} customDelayMs - Optional custom delay
   * @returns {Object} - Result with success, retryAt, retryCount
   */
  add(callData, reason, customDelayMs = null) {
    const phoneNumber = callData.phoneNumber || callData.to;
    
    // Check if already marked as bad number
    if (this.isBadNumber(phoneNumber)) {
      logger.warn('Call to bad number attempted - skipping retry', {
        phoneNumber,
        reason: 'Already marked as bad number'
      });
      return {
        success: false,
        error: 'Phone number already marked as bad',
        isBadNumber: true
      };
    }

    const delayMs = customDelayMs || RETRY_INTERVALS[reason] || RETRY_INTERVALS.failed;
    const retryAt = new Date(Date.now() + delayMs);
    const retryCount = (callData.retryCount || 0) + 1;

    // Check if max retries exceeded
    if (retryCount > MAX_RETRIES) {
      logger.warn(`Max retries exceeded for call - marking as bad number`, { 
        callSid: callData.callSid,
        phoneNumber,
        reason: reason,
        retryCount: retryCount
      });
      
      // Mark as bad number
      const badNumberResult = this.markBadNumber(
        phoneNumber,
        `Max retries exceeded after ${MAX_RETRIES} attempts (${reason})`,
        callData.leadId
      );
      
      return { 
        success: false, 
        error: 'Max retries exceeded',
        maxRetriesExceeded: true,
        markedAsBadNumber: true,
        badNumberResult
      };
    }

    const queueItem = {
      id: `retry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      callSid: callData.callSid,
      leadId: callData.leadId,
      phoneNumber: phoneNumber,
      to: callData.to,
      from: callData.from,
      reason: reason,
      originalAttemptAt: callData.originalAttemptAt || new Date().toISOString(),
      retryAt: retryAt.toISOString(),
      retryCount: retryCount,
      maxRetries: MAX_RETRIES,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.queue.push(queueItem);
    this.saveQueue();

    logger.info(`Call scheduled for retry`, {
      id: queueItem.id,
      callSid: callData.callSid,
      phoneNumber,
      reason: reason,
      retryAt: retryAt.toISOString(),
      retryCount: retryCount,
      maxRetries: MAX_RETRIES
    });

    return {
      success: true,
      id: queueItem.id,
      retryAt: retryAt.toISOString(),
      retryCount: retryCount,
      maxRetries: MAX_RETRIES
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
      item.retryAt <= now &&
      !this.isBadNumber(item.phoneNumber)
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
      item.updatedAt = new Date().toISOString();
      this.saveQueue();
      logger.info(`Retry item marked completed`, { id, phoneNumber: item.phoneNumber });
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
      item.updatedAt = new Date().toISOString();
      
      // Exponential backoff: double the delay
      const currentDelay = new Date(item.retryAt) - new Date(item.createdAt);
      const newRetryAt = new Date(Date.now() + (currentDelay * 2));
      item.retryAt = newRetryAt.toISOString();
      
      this.saveQueue();
      logger.info(`Retry item re-scheduled with backoff`, { 
        id, 
        phoneNumber: item.phoneNumber,
        newRetryAt: item.retryAt 
      });
    }
  }

  /**
   * Mark an item as permanently failed (bad number)
   * @param {string} id - Queue item ID
   * @param {string} reason - Reason for permanent failure
   */
  markPermanentlyFailed(id, reason) {
    const item = this.queue.find(q => q.id === id);
    if (item) {
      item.status = 'permanently_failed';
      item.failureReason = reason;
      item.failedAt = new Date().toISOString();
      item.updatedAt = new Date().toISOString();
      this.saveQueue();
      
      // Mark the phone number as bad
      this.markBadNumber(item.phoneNumber, reason, item.leadId);
      
      logger.warn(`Retry item permanently failed - marked as bad number`, { 
        id, 
        phoneNumber: item.phoneNumber,
        reason 
      });
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
      readyForRetry: this.getReadyForRetry().length,
      badNumbersCount: this.badNumbers.size
    };
    return stats;
  }

  /**
   * Get bad numbers list
   * @returns {Array} - Array of bad numbers with metadata
   */
  getBadNumbers() {
    return Array.from(this.badNumbers).map(number => ({
      phoneNumber: number,
      formatted: `+1${number}`
    }));
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
   * @returns {Object} - Processing results
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
      permanentlyFailed: 0,
      skippedBadNumber: 0
    };

    for (const item of readyItems) {
      // Skip if marked as bad number
      if (this.isBadNumber(item.phoneNumber)) {
        logger.warn(`Skipping retry for bad number`, { 
          id: item.id, 
          phoneNumber: item.phoneNumber 
        });
        this.markPermanentlyFailed(item.id, 'Phone number marked as bad');
        results.skippedBadNumber++;
        results.permanentlyFailed++;
        results.processed++;
        continue;
      }

      try {
        item.status = 'processing';
        item.updatedAt = new Date().toISOString();
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
        logger.error(`Error processing retry item`, { 
          id: item.id, 
          phoneNumber: item.phoneNumber,
          error: error.message 
        });
        
        // Check if we should mark as permanently failed
        if (item.retryCount >= MAX_RETRIES) {
          this.markPermanentlyFailed(item.id, error.message);
          results.permanentlyFailed++;
        } else {
          this.markFailed(item.id, error.message);
          results.failed++;
        }
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

module.exports = { RetryQueue, getRetryQueue, RETRY_INTERVALS, MAX_RETRIES };