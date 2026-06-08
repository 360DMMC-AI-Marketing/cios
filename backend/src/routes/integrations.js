const { Router } = require('express');
const { getIntegrations, updateIntegration, syncIntegration } = require('../controllers/integrationController');
const { auth, authorize } = require('../middleware/auth');

const router = Router();

router.use(auth);

router.get('/', getIntegrations);
router.patch('/:name', authorize('admin'), updateIntegration);
router.post('/:name/sync', authorize('admin'), syncIntegration);

module.exports = router;
