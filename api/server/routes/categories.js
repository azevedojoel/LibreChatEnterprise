const express = require('express');
const router = express.Router();
const { requireJwtAuth, requireTermsAccepted } = require('~/server/middleware');
const { getCategories } = require('~/models/Categories');

router.get('/', requireJwtAuth, requireTermsAccepted(), async (req, res) => {
  try {
    const categories = await getCategories();
    res.status(200).send(categories);
  } catch (error) {
    res.status(500).send({ message: 'Failed to retrieve categories', error: error.message });
  }
});

module.exports = router;
