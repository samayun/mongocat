/* eslint-disable no-prototype-builtins */

import {
  model,
  Schema,
  Types,
  MongooseQueryMiddleware,
  UpdateQuery,
} from 'mongoose';

import { flattenObj } from '../utils/flatten';
import { ObjectBuilder } from '../utils/filter';
import { ArrayBuilder } from '../utils/array/unique';
import { IPolymorphicArrayConsumer } from '../types';
import { denormalizeEmitter, updateQueryMethods } from '..';

export const polymorphicArrayConsumer = (ops: IPolymorphicArrayConsumer) => {
  const options = ops || {};
  options.toPath = options.toPath || 'contents';
  options.toPathNestedField = options.toPathNestedField || 'content';
  options.strict = options.strict || false;

  return (schema: Schema) => {
    const {
      toRef,
      availableProviders,
      localKey = 'modelId',
      foreignKey = '_id',
      fromRefPath = 'modelType',
      toPath,
      toPathNestedField,
      fixedProvider,
      morphSchemaMap,
      polymorphic = true,
      inArray = true,
    } = options;

    if (!toPath || !toPathNestedField || !localKey || !foreignKey)
      return new Error(
        `Configuration invalid: toPath:${toPath},toPathNestedField:${toPathNestedField}, localKey:${localKey} , foreignKey:${foreignKey}, inArray`
      );

    const hasStaticSubSchema =
      schema.paths[toPath] &&
      schema.paths[toPath]?.schema.paths[toPathNestedField];

    if (!hasStaticSubSchema) {
      if (!morphSchemaMap) {
        const msg = `Schema configuration invalid: toPath:${toPath} , localKey:${localKey} , foreignKey:${foreignKey}. either defiine static sub schema or dynamic morphSchemaMap`;
        console.log(msg);
        return new Error(msg);
      }

      schema.paths[toPath].schema.add({
        [toPathNestedField]: Schema.Types.Mixed,
      });
    }

    const allProviders =
      (fixedProvider && [fixedProvider]) ||
      (availableProviders && availableProviders) ||
      (morphSchemaMap && Object.keys(morphSchemaMap)) ||
      [];

    /***
     * Event emit after provider publishing
     */

    allProviders.map((provider: string): string => {
      denormalizeEmitter.on(
        `denormalize/publish/${provider}`,
        async (data: any) => {
          // Step-1: Get Model instance

          const { toPath, inArray = true, toRef } = options;

          // const ProviderModel = model(fromRef);
          const ConsumerModel = model(toRef);

          // Step-2: Get updatable key from Provider
          const _docData = data?._doc ? data?._doc : data;

          const flattenPublishedData = _docData;

          // Step-3: Get updatable key on consumer

          const schemaFeilds: string[] =
            (morphSchemaMap && Object.keys(morphSchemaMap[provider].paths)) ||
            Object.keys(
              schema.paths[toPath]?.schema.paths[toPathNestedField].schema.paths
            ) ||
            [];

          console.log({ schemaFeilds, flattenPublishedData });

          const filteredFlattenedData = ObjectBuilder.filterObject(
            flattenPublishedData,
            (_, k) => schemaFeilds.includes(k),
            value => !(value instanceof Types.ObjectId) && Object(value)
          );

          // Step-4: Update ConsumerModel
          const filterKey = `${toPath}.${localKey}`;

          const filterQuery = {
            [filterKey]: data[foreignKey],
          };

          // const toPath = `${toPath}.$.${localKey}`;
          // const contentUpdateBody = flattenObj({ [toPath]: updateDenormedData });

          const updateFlattenData: Record<string, any> = Object.entries(
            filteredFlattenedData
          ).reduce((acc, [k, value]) => {
            const consumerUpdateKeyPath = inArray
              ? `${toPath}.$.${toPathNestedField}.${k}`
              : `${toPath}.${toPathNestedField}.${k}`;
            return {
              ...acc,
              [consumerUpdateKeyPath]: value,
            };
          }, {});

          console.log({
            filterKey,
            filterQuery,
            updateFlattenData,
            filteredFlattenedData,
          });

          await ConsumerModel.updateMany(filterQuery, updateFlattenData, {
            new: true,
          });

          console.info(
            '\x1b[47m\x1b[46m%s\x1b[0m',
            `✨ Successfully denormalized via hook polymorphicArrayConsumer event emitted ✨`,
            '\x1b[1m\x1b[4m',
            `toRef: ${toRef}, from provider: ${provider}, toPath: ${toPath}, in polymorphic Array 🐦`
          );
        }
      );
      return `allProviders registered`;
    });

    /***
     * Event emit after provider publishing
     */

    /***
     * Change Stream sync
     */

    function watchPolymorphicProvider(provider: string) {
      const ConsumerModel = model(toRef);
      const ProviderModel = model(provider);

      let cursor: any;
      try {
        cursor = ProviderModel.watch();
      } catch (error) {
        cursor = null;
        throw new Error(`Change Stream not supported`);
      }

      // ChangeStreamDocument<any>
      cursor.on('change', async (change: any) => {
        console.log(
          `PolymorphicArrayConsumer: provider: ${provider} is calling for consumer:${options.toRef} on ${toPath} field`
        );

        if (change.operationType === 'update') {
          const updatedData = change.updateDescription?.updatedFields || {};

          const matchedKeys: string[] =
            (morphSchemaMap && Object.keys(morphSchemaMap[provider].paths)) ||
            Object.keys(
              schema.paths[toPath]?.schema.paths[toPathNestedField].schema.paths
            ) ||
            [];

          const updateDenormedData: Record<string, any> = {};
          const flattenProvider = flattenObj(updatedData);

          matchedKeys.forEach((key: string) => {
            updateDenormedData[key] = flattenProvider[key];
          });

          const providerId = change.documentKey?._id;

          if (!providerId) return;

          try {
            const filterKey = `${toPath}.${localKey}`;
            const filterQuery = {
              [filterKey]: providerId,
            };
            const toUpdate = `${toPath}.$.${toPathNestedField}`;

            const updateBody = flattenObj({ [toUpdate]: updateDenormedData });
            console.log({ filterQuery, toUpdate, updateBody });
            await ConsumerModel.updateMany(filterQuery, updateBody);
          } catch (error) {
            console.log(
              `Failed to denormalize error by changeStream, Model: ${toRef} Field: ${toPath} Nested: ${toPathNestedField}`,
              error.message
            );
            await cursor.close();
          }
        }
      });

      cursor.on('error', async (error: any) => {
        console.log(error.message || `Change Stream not supported`);
        await cursor.close();
      });
    }

    if (options.changeStreamEnabled && allProviders.length) {
      process.nextTick(() => {
        console.log({
          on: 'PolymorphicArrayConsumer',
          [toRef]: toPath,
          allProviders,
        });
        allProviders.map(watchPolymorphicProvider);
      });
    }

    /***
     * Change Stream sync
     */

    // eslint-disable-next-line @typescript-eslint/ban-types
    schema.pre(['save'], async function(next: Function) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const document: any = this;
      const doc = document?.toObject();

      // STEP-1: validate request
      if (!doc || !polymorphic || !inArray) return;

      // if (!doc[toPath] || !doc[toPath]?.length) {
      //   return next(new Error(`Conflict in toPath: field: ${toPath}`));
      // }

      if (fixedProvider && availableProviders) {
        return next(
          new Error(
            `Conflict in config: fixedProvider & availableProviders both shouldn't avilable field: ${toPath}`
          )
        );
      }

      // STEP-2: get provider model
      const ModelType: string = fixedProvider || doc[fromRefPath];

      const shouldDenormalize =
        ModelType &&
        (this.isNew || this.isModified(toPath)) &&
        inArray &&
        polymorphic &&
        !!doc &&
        !!doc[toPath] &&
        !!doc[toPath]?.length;

      console.log({
        shouldDenormalize,
        localKey,
        ModelType,
        toPath,
        toRef,
      });

      if (shouldDenormalize) {
        if (!toPath || !ModelType) return;

        const ProviderModel = model(ModelType);

        // STEP-3: get unique provider keys
        const providersKeys = doc[toPath];
        const uniqueKeys = ArrayBuilder.uniqueKeys(providersKeys, localKey);

        // Flat providerValues
        const uniqueValues = ArrayBuilder.uniqueValues(providersKeys, localKey);

        // STEP-4: get provided contents

        const filterQuery = {
          [foreignKey]: {
            $in: uniqueKeys,
          },
        };
        const providers = await ProviderModel.find(filterQuery);

        console.log({ ProviderModel, uniqueKeys, uniqueValues });

        const contents = doc[toPath]?.map(
          (toPathNested: Record<string, any>) => {
            const content = providers?.find(
              (_pro: Record<string, any>) =>
                _pro[foreignKey]?.toString() ===
                toPathNested[localKey].toString()
            );

            toPathNested[toPathNestedField] = content;
            return toPathNested;
          }
        );

        // STEP-4: parse & set feilds to be saved
        this[toPath] = contents;
        return next();
      }

      return next();
    });

    /**
     * onUpdate polymorphicConsumer
     */
    schema.pre(
      Object.keys(updateQueryMethods) as MongooseQueryMiddleware[],
      async function(next: any) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self: any = this;
        if (!self || !fixedProvider) return;

        // const shouldDenormalize = !!self.options['denormalize']; // {denormalize: true}
        const shouldDenormalize = self.options['denormalize'] || false;
        self['$denormalize'] = shouldDenormalize;

        if (!shouldDenormalize) return;

        const updateParams = self.getUpdate() as UpdateQuery<any>;
        const doc = updateParams;

        if (!doc || !doc[toPath]) return;
        self['$denormalize'] = shouldDenormalize;

        // const updateField = updateParams.$set || {};

        const ignoredFields = ['createdAt', 'updatedAt', '__v'] as string[];

        ignoredFields.forEach(key => {
          delete updateParams[key];
        });

        delete doc['$set'];
        delete doc['$setOnInsert'];

        const ModelType: string = fixedProvider || doc[fromRefPath];

        if (fixedProvider && availableProviders) {
          return next(
            new Error(
              `Conflict in config: fixedProvider & availableProviders both shouldn't avilable  field: ${toPath}`
            )
          );
        }

        if (
          !fixedProvider &&
          availableProviders &&
          !availableProviders.includes(ModelType)
        ) {
          return next(
            new Error(
              `NOT AVILABLE in list: availableProviders: ${availableProviders}, but got: ${ModelType} field: ${toPath}, plugin: polymorphicConsumer , method: save`
            )
          );
        }

        if (availableProviders && morphSchemaMap) {
          return next(
            new Error(
              `Conflict in config: morphSchemaMap & availableProviders both shouldn't avilable on path: ${toPath}`
            )
          );
        }

        if (shouldDenormalize) {
          if (!toPath || !ModelType) return;

          console.log({
            shouldDenormalize,
            localKey,
            doc,
            toPath,
          });

          const ProviderModel = model(ModelType);

          // STEP-3: get unique provider keys
          const providersKeys = doc[toPath];
          const uniqueKeys = ArrayBuilder.uniqueKeys(providersKeys, localKey);

          // STEP-4: get provided contents

          const filterQuery = {
            [foreignKey]: {
              $in: uniqueKeys,
            },
          };
          const providers = await ProviderModel.find(filterQuery);

          console.log({ ProviderModel, uniqueKeys });

          const contents = doc[toPath]?.map(
            (toPathNested: Record<string, any>) => {
              const content = providers?.find(
                (_pro: Record<string, any>) =>
                  _pro[foreignKey]?.toString() ===
                  toPathNested[localKey].toString()
              );

              toPathNested[toPathNestedField] = content;
              return toPathNested;
            }
          );

          // STEP-4: parse & set feilds to be saved
          doc[toPath] = contents;
          return next();
        }
        return next();
      }
    );
  };
};
