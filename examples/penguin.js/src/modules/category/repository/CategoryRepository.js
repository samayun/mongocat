/* eslint-disable class-methods-use-this */
const Category = require('../../../models/Category');

class CategoryService {
  constructor(Model) {
    this.Model = Model;
  }

  async create(params) {
    const category = new this.Model(params);
    return category.save();
  }

  async findMany() {
    return this.Model.find({}).sort('-createdAt');
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

module.exports = new CategoryService(Category);
