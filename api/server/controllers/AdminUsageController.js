const { logger } = require('@librechat/data-schemas');
const { Transaction, Balance } = require('~/db/models');
const { getTransactions } = require('~/models/Transaction');
const { getUserById } = require('~/models');

/**
 * List transactions with optional filters (admin only)
 * Query: userId, conversationId, model, tokenType, startDate, endDate, limit, page
 */
const listUsage = async (req, res) => {
  try {
    const { userId, conversationId, model, tokenType, startDate, endDate, limit = 50, page = 1 } =
      req.query;

    const filter = {};
    if (userId && userId.trim()) {
      filter.user = userId.trim();
    }
    if (conversationId && conversationId.trim()) {
      filter.conversationId = conversationId.trim();
    }
    if (model && model.trim()) {
      filter.model = model.trim();
    }
    if (tokenType && tokenType.trim()) {
      filter.tokenType = tokenType.trim();
    }
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate);
      }
    }

    const limitNum = Math.min(100, parseInt(limit, 10) || 50);
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * limitNum;

    const [transactions, total] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Transaction.countDocuments(filter),
    ]);

    const sanitized = transactions.map((t) => ({
      id: t._id?.toString(),
      user: t.user?.toString(),
      conversationId: t.conversationId,
      tokenType: t.tokenType,
      model: t.model,
      rawAmount: t.rawAmount,
      tokenValue: t.tokenValue,
      inputTokens: t.inputTokens,
      writeTokens: t.writeTokens,
      readTokens: t.readTokens,
      createdAt: t.createdAt,
    }));

    return res.status(200).json({
      transactions: sanitized,
      total,
      page: Math.floor(skip / limitNum) + 1,
      limit: limitNum,
    });
  } catch (error) {
    logger.error('[AdminUsageController.listUsage]', error);
    return res.status(500).json({ message: 'Failed to list usage' });
  }
};

/**
 * Aggregate usage by user (admin only)
 * Query: userId (optional), startDate, endDate
 */
const aggregateUsage = async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.query;

    const match = {};
    if (userId && userId.trim()) {
      match.user = userId.trim();
    }
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) {
        match.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        match.createdAt.$lte = new Date(endDate);
      }
    }

    const pipeline = [
      { $match: Object.keys(match).length ? match : {} },
      {
        $group: {
          _id: '$user',
          totalRawAmount: { $sum: '$rawAmount' },
          totalTokenValue: { $sum: '$tokenValue' },
          transactionCount: { $sum: 1 },
        },
      },
      { $sort: { totalTokenValue: -1 } },
    ];

    const results = await Transaction.aggregate(pipeline);

    const aggregated = results.map((r) => ({
      userId: r._id?.toString(),
      totalRawAmount: r.totalRawAmount,
      totalTokenValue: r.totalTokenValue,
      transactionCount: r.transactionCount,
    }));

    return res.status(200).json({ aggregated });
  } catch (error) {
    logger.error('[AdminUsageController.aggregateUsage]', error);
    return res.status(500).json({ message: 'Failed to aggregate usage' });
  }
};

/**
 * Get user balance (admin only)
 */
const getUserBalance = async (req, res) => {
  try {
    const { userId } = req.params;
    const { includeTransactions } = req.query;

    const user = await getUserById(userId, '_id');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const balance = await Balance.findOne({ user: userId }).lean();

    const result = {
      userId,
      tokenCredits: balance?.tokenCredits ?? 0,
    };

    if (includeTransactions === 'true' || includeTransactions === '1') {
      try {
        const txns = await getTransactions({ user: userId });
        result.recentTransactions = txns
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 20)
          .map((t) => ({
            id: t._id?.toString(),
            conversationId: t.conversationId,
            tokenType: t.tokenType,
            model: t.model,
            rawAmount: t.rawAmount,
            tokenValue: t.tokenValue,
            createdAt: t.createdAt,
          }));
      } catch {
        result.recentTransactions = [];
      }
    }

    return res.status(200).json(result);
  } catch (error) {
    logger.error('[AdminUsageController.getUserBalance]', error);
    return res.status(500).json({ message: 'Failed to get user balance' });
  }
};

module.exports = {
  listUsage,
  aggregateUsage,
  getUserBalance,
};
