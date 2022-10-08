const { watchConsumer } = require('mongocat');
const { Schema, model } = require('mongoose');

const tagSchema = [
  new Schema({
    _id: Schema.Types.ObjectId,
    title: String,
  }),
];

const modelSchema = new Schema(
  {
    title: String,
    // slug generated for the post
    slug: {
      source: 'title', // source for generating the slug
      type: String,
      unique: true,
    },
    category: new Schema({
      _id: Schema.Types.ObjectId,
      title: String,
      avatar: String,
      status: Boolean,
    }),
    tags: {
      type: tagSchema,
      default: undefined,
    },
    // tags: tagSchema,
    status: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
)
  .plugin(
    watchConsumer({
      key: '_id',
      toPath: 'category',
      strict: true,
      fromRef: 'Category',
      toRef: 'Blog',
    }),
  )
  .plugin(
    watchConsumer({
      key: '_id',
      toPath: 'tags',
      inArray: true,
      strict: true,
      fromRef: 'Tag',
      toRef: 'Blog',
    }),
  );

module.exports = model('Blog', modelSchema);
