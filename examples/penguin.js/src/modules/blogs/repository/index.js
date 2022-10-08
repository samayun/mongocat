/* eslint-disable class-methods-use-this */
const Blog = require('../../../models/Blog');

class BlogService {
  constructor(Model) {
    this.Model = Model;
  }

  async create(params) {
    const blog = new this.Model(params);

    return blog.save();
  }

  async findMany() {
    return this.Model.find({}).sort('-createdAt').limit(10);
  }

  async update(id, params) {
    return this.Model.findByIdAndUpdate(id, params, {
      new: true,
      denormalize: true,
    });
  }

  async delete(id) {
    return this.Model.findByIdAndDelete(id);
  }

  async deleteBulk() {
    return this.Model.deleteMany({});
  }
}

module.exports = new BlogService(Blog);
