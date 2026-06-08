const Resource = require('../models/Resource');
const { getDomainProjectIds } = require('../config/planLimits');

const populate = q => q.populate('addedBy', 'name role');

exports.getResources = async (req, res, next) => {
  try {
    const { category, type, search } = req.query;
    const projectIds = await getDomainProjectIds(req.user.domain);
    const filter = { project: { $in: projectIds } };
    if (category) filter.category = category;
    if (type) filter.type = type;
    if (search) filter.title = { $regex: search, $options: 'i' };
    const resources = await populate(Resource.find(filter).sort({ createdAt: -1 }));
    res.json(resources);
  } catch (e) { next(e); }
};

exports.addResource = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    if (!projectIds.some(id => id.toString() === req.params.projectId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const data = { ...req.body, project: req.params.projectId, addedBy: req.user._id };
    if (req.file) {
      data.fileUrl = '/uploads/' + req.file.filename;
      data.fileName = req.file.originalname;
      data.fileSize = req.file.size;
      data.fileType = req.file.mimetype;
      data.category = data.category || 'file';
      data.type = data.type || 'other';
    }
    const resource = await Resource.create(data);
    res.status(201).json(await populate(Resource.findById(resource._id)));
  } catch (e) { next(e); }
};

exports.updateResource = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.file) {
      data.fileUrl = '/uploads/' + req.file.filename;
      data.fileName = req.file.originalname;
      data.fileSize = req.file.size;
      data.fileType = req.file.mimetype;
    }
    const projectIds = await getDomainProjectIds(req.user.domain);
    const resource = await populate(Resource.findOneAndUpdate(
      { _id: req.params.id, project: { $in: projectIds } },
      data,
      { new: true, runValidators: true }
    ));
    if (!resource) return res.status(404).json({ message: 'Resource not found' });
    res.json(resource);
  } catch (e) { next(e); }
};

exports.deleteResource = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const resource = await Resource.findOneAndDelete({ _id: req.params.id, project: { $in: projectIds } });
    if (!resource) return res.status(404).json({ message: 'Resource not found' });
    res.json({ message: 'Deleted' });
  } catch (e) { next(e); }
};
