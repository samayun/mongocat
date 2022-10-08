const { provider } = require('mongocat');
const { Schema, model } = require('mongoose');

const modelSchema = new Schema(
  {
    title: String,
    status: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
).plugin(
  provider({
    toRef: 'Tag',
  }),
);

module.exports = model('Tag', modelSchema);
