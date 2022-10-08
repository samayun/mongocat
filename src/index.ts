const EventEmitter = require('events');

export const denormalizeEmitter = new EventEmitter();

export const updateQueryMethods = {
  findByIdAndUpdate: 'findById',
  findOneAndUpdate: 'findOne',
  update: 'find',
  updateOne: 'findOne',
  // updateMany: 'find', // updateMany will be used for mongocat-sync
};

export * from './plugins/Provider';
export * from './plugins/Consumer';
export * from './plugins/WatchConsumer';
export * from './plugins/PolymorphicConsumer';
export * from './plugins/PolymorphicArrayConsumer';
