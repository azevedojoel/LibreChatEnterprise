const express = require('express');
const {
  updateFavoritesController,
  getFavoritesController,
} = require('~/server/controllers/FavoritesController');
const { requireJwtAuth, requireTermsAccepted } = require('~/server/middleware');

const router = express.Router();

router.get('/favorites', requireJwtAuth, requireTermsAccepted(), getFavoritesController);
router.post('/favorites', requireJwtAuth, requireTermsAccepted(), updateFavoritesController);

module.exports = router;
