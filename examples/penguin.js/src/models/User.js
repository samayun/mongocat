const { provider } = require('mongocat');
const { Schema, model } = require('mongoose');

const modelSchema = new Schema(
  {
    name: String,
    email: String,
    role: {
      type: String,
      default: 'user',
    },
    status: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
).plugin(
  provider({
    toRef: 'User',
  }),
);

module.exports = model('User', modelSchema);
