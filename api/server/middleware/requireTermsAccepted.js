const { User } = require('~/db/models');
const { getAppConfig } = require('~/server/services/Config');
const { logger } = require('@librechat/data-schemas');

/**
 * Middleware that enforces terms of service acceptance for authenticated users.
 * Must be used after requireJwtAuth. When modalAcceptance is enabled in config,
 * blocks access to protected routes until the user has accepted terms.
 *
 * @param {Object} [options] - Configuration options
 * @param {string[]} [options.exclude] - Paths to exclude from terms check (e.g. ['/', '/terms', '/terms/accept'])
 * @returns {Function} Express middleware
 */
const requireTermsAccepted = (options = {}) => {
  const excludePaths = options.exclude || [];

  return async (req, res, next) => {
    if (!req.user?.id) {
      return next();
    }

    const path = req.path.endsWith('/') && req.path.length > 1 ? req.path.slice(0, -1) : req.path;
    const isExcluded = excludePaths.some(
      (p) => path === p || path === `${p}/` || path.startsWith(`${p}/`),
    );
    if (isExcluded) {
      return next();
    }

    try {
      const appConfig = await getAppConfig({ role: req.user?.role });
      const modalAcceptance = appConfig?.interfaceConfig?.termsOfService?.modalAcceptance;

      if (modalAcceptance !== true) {
        return next();
      }

      const user = await User.findById(req.user.id).select('termsAccepted').lean();
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (user.termsAccepted) {
        return next();
      }

      return res.status(403).json({
        message: 'You must accept the Terms of Service to continue',
        code: 'TERMS_NOT_ACCEPTED',
      });
    } catch (error) {
      logger.error('[requireTermsAccepted] Error checking terms acceptance:', error);
      return res.status(500).json({ message: 'Error verifying terms acceptance' });
    }
  };
};

module.exports = requireTermsAccepted;
