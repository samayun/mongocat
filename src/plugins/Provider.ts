import { IProvider } from '../types';
import { denormalizeEmitter, updateQueryMethods } from '..';
import { MongooseQueryMiddleware, Schema, UpdateQuery } from 'mongoose';

/**
 * It's used on ProviderModel
 * @param options = {
      keyFields: ['_id','name','status],
      ignoredFields: ['_id','name','status],
      toRef: 'Category',
    }
 * @returns 
 */

export const provider = (ops?: IProvider) => {
  const options = ops || {};
  options.keyFields = options.keyFields || ['_id'];
  options.ignoredFields = [
    ...(options.ignoredFields || []),
    'createdAt',
    'updatedAt',
    '__v',
  ] as string[];

  return (schema: Schema) => {
    const { toRef, ignoredFields, keyFields } = options;
    // for:  return genre.save();
    // eslint-disable-next-line @typescript-eslint/ban-types
    schema.post(['save'], async function(doc: any, next: Function) {
      if (!this['$__']['inserting']) {
        // when provider updates then publish only otherwise no need
        const modelRef = toRef || this.constructor.modelName;
        denormalizeEmitter.emit(`denormalize/publish/${modelRef}`, doc._doc);
      }
      return next();
    });

    schema.post(
      Object.keys(updateQueryMethods) as MongooseQueryMiddleware[],
      async function() {
        const self = this as any;
        // toRef
        const providerModelRef = self.model.modelName;

        const queryParams = this.getQuery();

        const updateParams = this.getUpdate() as UpdateQuery<any>;

        const updateFields = updateParams.$set || {};
        const listeningFields = Object.keys(updateFields).filter(
          v => !ignoredFields?.includes(v)
        );

        if (listeningFields.length === 0) {
          return;
        }
        const listeningUpdateFields: Record<string, any> = {};
        for (const key in updateFields) {
          if (listeningFields.includes(key)) {
            listeningUpdateFields[key] = updateFields[key];
          }
        }

        const keyFieldsFound = Object.keys(queryParams).filter(
          v => !Array.isArray(keyFields) || keyFields.includes(v)
        );

        let getKeyArray: Record<string, any>[] = [queryParams];

        if (keyFieldsFound.length !== keyFields?.length) {
          const operation = self.op as keyof typeof updateQueryMethods;
          const document = (await self.model[updateQueryMethods[operation]](
            queryParams
          )) as Record<string, any> | Record<string, any>[];
          if (!document || document.length === 0) {
            throw new Error('Document not found');
          }
          getKeyArray = Array.isArray(document) ? document : [document];
        }

        getKeyArray.forEach((getKeyObj: Record<string, any>) => {
          const keyFieldsObj =
            keyFields &&
            keyFields.reduce(
              (acc: Record<string, any>, v: string) => ({
                ...acc,
                [v]: getKeyObj[v],
              }),
              {}
            );
          const publishableData = { ...listeningUpdateFields, ...keyFieldsObj };

          // const shouldDenormalize = !!self.options['denormalize']; // {denormalize: true}
          const shouldDenormalize = self.options['denormalize'] || false;
          self['$denormalize'] = shouldDenormalize;

          if (!shouldDenormalize) return;

          console.log('publish these fields', publishableData);
          denormalizeEmitter.emit(
            `denormalize/publish/${providerModelRef}`,
            publishableData
          );
          // publish && publish(publishableData);
        });
      }
    );
  };
};
