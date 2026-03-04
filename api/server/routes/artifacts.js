const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');
const { saveArtifactPdfToFiles } = require('~/server/services/Artifacts/savePdfToFiles');

const router = express.Router();
router.use(requireJwtAuth);
router.use(configMiddleware);

router.post('/pdf', async (req, res) => {
  try {
    if (!req.config) {
      return res.status(503).json({ error: 'Server configuration not available' });
    }
    const { html, filename } = req.body ?? {};
    if (!html || typeof html !== 'string') {
      return res.status(400).json({ error: 'HTML content is required' });
    }

    const result = await saveArtifactPdfToFiles({
      req,
      html,
      filename: filename || 'document.pdf',
    });

    return res.json(result);
  } catch (error) {
    logger.error('[artifacts/pdf] Error saving PDF:', error);
    return res.status(500).json({
      error: error.message || 'Failed to save PDF',
    });
  }
});

module.exports = router;
