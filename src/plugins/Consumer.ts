import { IConsumer } from '../types';
import { model, Schema } from 'mongoose';

/**
 * It's used on sub schema on ConsumerModel
 * @param options = {
    key: '_id',
    toPath: 'category', // no neccessary when we need duplicate with other collection
    fromRef: 'Category',
    toRef: 'Blog',
    withTimestamp: true,
  }
 */
export const consumer = (ops: IConsumer) => {
  const options = ops || {};
  options.toPath = options.toPath || options.fromRef.toLowerCase();

  return (schema: Schema) => {
    const { key = '_id', fromRef, toRef, withTimestamp } = options;
    if (!key) return;

    if (withTimestamp) {
      schema.add({
        denormalizedAt: { type: Date },
      });
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    schema.pre(['save'], async function(next: Function) {
      if (this) {
        console.log({
          plugin: 'consumer',
          method: 'pre save',
          provider: fromRef,
          consumer: toRef,
        });

        const foreignKey = key;
        const ProviderModel = model(fromRef);
        const provider: Record<
          string,
          any
        > | null = await ProviderModel.findOne(
          { [foreignKey]: this[foreignKey] },
          { createdAt: 0, updatedAt: 0 }
        );

        if (!provider) {
          return next(
            new Error(
              `Denormalization failed for key: ${key}, value: ${this[key]}, plugin: consumer ,method: save, consumer: ${toRef}, provider: ${fromRef}`
            )
          );
        }

        Object.assign(this, provider?.toObject());
        next();
      }
    });
  };
};
