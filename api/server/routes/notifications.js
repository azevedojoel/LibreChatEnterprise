const express = require('express');
const mongoose = require('mongoose');
const { Notification } = require('~/db/models');
const { logger } = require('@librechat/data-schemas');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();
router.use(requireJwtAuth);

/**
 * GET /api/notifications
 * List notifications for the current user, paginated.
 * Query: limit (default 25), cursor, unreadOnly (boolean)
 */
router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
  const cursor = req.query.cursor;
  const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === true;

  const filter = { userId: req.user.id };
  if (unreadOnly) {
    filter.readAt = null;
  }

  try {
    let query = Notification.find(filter).sort({ createdAt: -1 }).limit(limit + 1).lean();

    if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
      const cursorDoc = await Notification.findById(cursor).lean();
      if (cursorDoc && cursorDoc.userId?.toString() === req.user.id) {
        query = query.where('createdAt').lt(cursorDoc.createdAt);
      }
    }

    const docs = await query;
    const hasMore = docs.length > limit;
    const items = hasMore ? docs.slice(0, limit) : docs;
    const nextCursor = hasMore ? items[items.length - 1]._id.toString() : null;

    const unreadCount = await Notification.countDocuments({
      userId: req.user.id,
      readAt: null,
    });

    res.status(200).json({
      notifications: items,
      nextCursor,
      hasMore,
      unreadCount,
    });
  } catch (error) {
    logger.error('Error fetching notifications', error);
    res.status(500).json({ error: 'Error fetching notifications' });
  }
});

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read for the current user.
 */
router.patch('/read-all', async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.user.id, readAt: null },
      { $set: { readAt: new Date() } },
    );

    res.status(200).json({ updated: result.modifiedCount });
  } catch (error) {
    logger.error('Error marking all notifications read', error);
    res.status(500).json({ error: 'Error marking all notifications read' });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read.
 */
router.patch('/:id/read', async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid notification ID' });
  }

  try {
    const doc = await Notification.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      { $set: { readAt: new Date() } },
      { new: true },
    );

    if (!doc) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.status(200).json(doc.toObject());
  } catch (error) {
    logger.error('Error marking notification read', error);
    res.status(500).json({ error: 'Error marking notification read' });
  }
});

module.exports = router;
