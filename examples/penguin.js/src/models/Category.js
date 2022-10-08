const { provider } = require('mongocat');
const { model, Schema } = require('mongoose');

const modelSchema = new Schema(
  {
    title: String,
    avatar: String,
    status: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
).plugin(
  provider({
    toRef: 'Category',
  }),
);

module.exports = model('Category', modelSchema);
