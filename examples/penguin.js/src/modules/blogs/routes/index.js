module.exports = () => {
  const path = '/v1/blogs';
  const router = require('express').Router();
  const service = require('../repository/index');

  router.get('/', async (req, res, next) => {
    /* #swagger.tags = ['Blog'] */
    try {
      const data = await service.findMany();

      return res.status(200).json({ success: true, message: 'Get all blogs', data });
    } catch (error) {
      next(new Error(error.message));
    }
  });

  router.post('/', async (req, res, next) => {
    /* #swagger.tags = ['Blog'] */
    try {
      const data = await service.create({
        title: req.body.title,
        category: {
          _id: req.body.categoryId,
        },
      });

      return res.status(200).json({ success: true, message: 'create blogs', data });
    } catch (error) {
      next(new Error(error.message));
    }
  });

  router.put('/:id', async (req, res, next) => {
    /* #swagger.tags = ['Blog'] */
    try {
      const data = await service.update(req.params.id, {
        title: req.body.title,
        category: {
          _id: req.body.categoryId,
        },
        tags: req.body.tags,
      });

      return res.status(200).json({ success: true, message: 'update', data });
    } catch (error) {
      next(new Error(error.message));
    }
  });

  router.delete('/:id', async (req, res, next) => {
    /* #swagger.tags = ['Blog'] */
    try {
      const data = await service.delete(req.params.id);

      return res.status(200).json({ success: true, message: 'delete', data });
    } catch (error) {
      next(new Error(error.message));
    }
  });

  router.delete('/bulk', async (req, res, next) => {
    /* #swagger.tags = ['Blog'] */
    try {
      const data = await service.deleteBulk();

      return res.status(200).json({ success: true, message: 'delete all ', data });
    } catch (error) {
      next(new Error(error.message));
    }
  });

  return { path, router };
};
