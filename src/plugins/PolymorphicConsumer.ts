/* eslint-disable no-prototype-builtins */

import {
  model,
  Types,
  MongooseQueryMiddleware,
  Schema,
  UpdateQuery,
} from 'mongoose';
import { IPolymorphicConsumer } from '../types';
import { flattenObj } from '../utils/flatten';
import { ObjectBuilder } from '../utils/filter';
import { unflattenObj } from '../utils/unflatten';
import { denormalizeEmitter, updateQueryMethods } from '..';

/**
 * 
 * @param options = {
      key: '_id',
      localKey: 'modelId',
      fromRef: 'modelType',
      toPath: 'content',
      withTimestamp: true,
    }
 * @returns 
 */
export const polymorphicConsumer = (ops: IPolymorphicConsumer) => {
  const options = ops || {};
  options.toPath = options.toPath || 'content';

  return (schema: Schema) => {
    const {
      fixedProvider,
      availableProviders,
      localKey = 'modelId',
      foreignKey = '_id',
      fromRefPath = 'modelType',
      toPath,
      morphSchemaMap,
      withTimestamp,
      denormWhen,
      modelSwitcher,
      clean,
      strict,
      exceptionOnFailure,
      as,
      inArray = false,
      polymorphic = true,
      toRef,
      // old
      morphKey = 'modelId',
      fromRef = 'modelType',
    } = options;

    if (!toPath || !localKey || !foreignKey)
      return new Error(
        `Configuration invalid: toPath:${toPath} , localKey:${localKey} , foreignKey:${foreignKey}`
      );

    if (clean) {
      // Don't use without knowing properly
      schema.methods.toJSON = function() {
        const objectEntity = this.toObject();
        delete objectEntity[localKey];
        delete objectEntity[fromRefPath];
        return objectEntity;
      };
    }

    if (withTimestamp) {
      schema.add({
        denormalizedAt: { type: Date },
      });
    }

    // eslint-disable-next-line no-prototype-builtins
    if (!schema.paths.hasOwnProperty(toPath)) {
      if (!morphSchemaMap) {
        const msg = `Schema configuration invalid: toPath:${toPath} , localKey:${localKey} , foreignKey:${foreignKey}. either defiine static sub schema or dynamic morphSchemaMap`;
        console.log(msg);
        return new Error(msg);
      }

      schema.add({
        [toPath]: Schema.Types.Mixed,
      });
    }

    const allProviders =
      (fixedProvider && [fixedProvider]) ||
      (availableProviders && availableProviders) ||
      (morphSchemaMap && Object.keys(morphSchemaMap)) ||
      (options.modelSwitcher && Object.values(options.modelSwitcher)) ||
      [];

    /***
     * Event emit after provider publishing
     */

    allProviders.map((provider: string) => {
      denormalizeEmitter.on(
        `denormalize/publish/${provider}`,
        async (data: any) => {
          // Step-1: Get Model instance

          const { toPath, inArray = false, toRef } = options;

          // const ProviderModel = model(fromRef);
          const ConsumerModel = model(toRef);

          console.log({ options, data });

          // Step-2: Get updatable key from Provider
          const _docData = data?._doc ? data?._doc : data;

          const flattenPublishedData = _docData;

          // Step-3: Get updatable key on consumer

          const schemaFeilds: string[] =
            (morphSchemaMap && Object.keys(morphSchemaMap[provider].paths)) ||
            Object.keys(schema.paths[toPath]?.schema?.paths) ||
            [];

          console.log({ schemaFeilds, flattenPublishedData });

          const filteredFlattenedData = ObjectBuilder.filterObject(
            flattenPublishedData,
            (_, k) => schemaFeilds.includes(k),
            value => !(value instanceof Types.ObjectId) && Object(value)
          );

          // Step-4: Update ConsumerModel

          const filterKey = `${toPath}.${foreignKey}`;

          const filterQuery = {
            [filterKey]: data[foreignKey],
          };

          const updateFlattenData: Record<string, any> = Object.entries(
            filteredFlattenedData
          ).reduce((acc, [k, value]) => {
            const consumerUpdateKeyPath = inArray
              ? `${toPath}.$.${k}`
              : `${toPath}.${k}`;
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
            `✨ Successfully denormalized via hook polymorphicConsumer event emitted ✨`,
            '\x1b[1m\x1b[4m',
            `toRef: ${toRef}, from provider: ${provider}, toPath: ${toPath}, inObject 🐦`
          );
        }
      );
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
          `provider: ${provider} is calling for consumer:${options.toRef} on ${toPath} field`
        );

        if (change.operationType === 'update') {
          const updatedData = change.updateDescription?.updatedFields || {};

          const matchedKeys =
            (schema.paths
              .hasOwnProperty(toPath)
              .hasOwnProperty('schema')
              .hasOwnProperty('paths') &&
              Object.keys(schema.paths[toPath]?.schema?.paths)) ||
            (morphSchemaMap && Object.keys(morphSchemaMap[provider].paths)) ||
            [];

          const updateDenormedData: Record<string, any> = {};
          const flattenProvider = flattenObj(updatedData);

          matchedKeys.forEach((key: string) => {
            updateDenormedData[key] = flattenProvider[key];
          });

          as &&
            Object.entries(as).forEach(([key, value]) => {
              if (flattenProvider[value]) {
                updateDenormedData[key as string] = flattenProvider[value];
              }
            });

          const providerId = change.documentKey?._id;

          if (!providerId) return;

          try {
            const filterQuery = {
              [localKey]: providerId,
              [toPath]: {
                $exists: true,
              },
              ...(!fixedProvider && { [fromRefPath]: provider }),
            };
            const updateBody = flattenObj({ [toPath]: updateDenormedData });
            console.log({ filterQuery, updateBody });
            await ConsumerModel.updateMany(filterQuery, updateBody);
          } catch (error) {
            console.log(
              `Failed to denormalize error by changeStream, Model: ${ConsumerModel} Field: ${toPath}`
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
      // Step-1: get modelType value
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const doc: any = this;
      const ModelType: string =
        fixedProvider || doc[fromRef] || doc[fromRefPath];
      const LocalValue = doc[morphKey] || doc[localKey];

      if (!toPath || !LocalValue || !ModelType) return;

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

      if (denormWhen && doc[denormWhen['field']]) {
        if (denormWhen['is'] && denormWhen['is'] != doc[denormWhen['field']])
          return;
        if (denormWhen['ne'] && denormWhen['ne'] == doc[denormWhen['field']])
          return;
        if (
          denormWhen['in'] &&
          !denormWhen['in'].includes(doc[denormWhen['field']])
        )
          return;
        if (
          denormWhen['nin'] &&
          denormWhen['nin'].includes(doc[denormWhen['field']])
        )
          return;
      }

      const shouldDenormalize =
        LocalValue &&
        ModelType &&
        (this.isNew ||
          this.isModified(localKey) ||
          this.isModified(fromRefPath));

      console.log({
        shouldDenormalize,
        localKey,
        LocalValue,
        ModelType,
        fixedProvider,
        toPath,
        toRef,
      });

      if (shouldDenormalize) {
        let ProviderModel: any;

        if (modelSwitcher && modelSwitcher[ModelType]) {
          ProviderModel = model(modelSwitcher[ModelType]);
        } else {
          if (morphSchemaMap && !morphSchemaMap[ModelType]) {
            return next(
              new Error(
                `${ModelType} is not available on morphSchemaMap's schema.Please define schema for this modelType`
              )
            );
          } else if (
            availableProviders &&
            !availableProviders.includes(ModelType)
          ) {
            return next(
              new Error(
                `${ModelType} is not available on morphSchemaMap's schema.Please define schema for this modelType`
              )
            );
          }

          ProviderModel = model(ModelType);
        }
        /**
         *  Step-2: get Provider model instance & value ProviderModel({_id: modelId }).
         *  here [ProviderModel]({ [foreignKey]: localValue })
         */
        const provider: Record<
          string,
          any
        > | null = await ProviderModel.findOne(
          { [foreignKey]: LocalValue },
          { createdAt: 0, updatedAt: 0 }
        );

        if (!provider) {
          if (strict || exceptionOnFailure) {
            return next(
              new Error(
                `Denormalization failed for foreignKey:${foreignKey}, value: ${LocalValue} field: ${toPath}, plugin: polymorphicConsumer , method: save`
              )
            );
          } else {
            return next();
          }
        }

        let updateDenormedData: Record<string, any> = {};

        if (morphSchemaMap) {
          /**
                 morphSchemaMap: {
                      Artist: new Schema({
                          _id: {  type: Schema.Types.ObjectId },
                          name: String,
                          slug: String,
                          avatar: String,
                        }),
                      Genre: new Schema({
                          _id: {  type: Schema.Types.ObjectId },
                          title: String,
                          slug: String
                        }),
                  },
                 */
          const morphSchemaKeys = Object.keys(morphSchemaMap[ModelType].paths);

          const processor: Record<string, any> = {};
          const flattenProvider = flattenObj(provider.toObject());

          morphSchemaKeys.forEach((key: any) => {
            processor[key] = flattenProvider[key];
          });

          as &&
            Object.entries(as).forEach(([key, value]) => {
              if (flattenProvider[value]) {
                processor[key as string] = flattenProvider[value];
              }
            });
          updateDenormedData = unflattenObj(processor);
        } else {
          updateDenormedData = provider.toObject();
        }

        if (as) {
          const flattenProvider = flattenObj(provider.toObject());
          // doc[toPath] = flattenProvider || { [foreignKey]: LocalValue };

          let aliasMappedObject: Record<string, any> = {};

          Object.entries(as).forEach(([key, value]) => {
            if (flattenProvider[value]) {
              aliasMappedObject[key as string] = flattenProvider[value];
            }
          });

          aliasMappedObject = unflattenObj({
            ...flattenProvider,
            ...aliasMappedObject,
          });

          this[toPath] = aliasMappedObject;

          if (withTimestamp) {
            this['denormalizedAt'] = new Date().toISOString();
          }
          return next();
        }

        // Step-3: set denormmalized value on polymorphicConsumer
        doc[toPath] = updateDenormedData;

        if (withTimestamp) {
          doc['denormalizedAt'] = new Date().toISOString();
        }
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
        if (!self) return;

        // const shouldDenormalize = !!self.options['denormalize']; // {denormalize: true}
        const shouldDenormalize = self.options['denormalize'] || false;
        self['$denormalize'] = shouldDenormalize;

        if (!shouldDenormalize) return;

        const updateParams = self.getUpdate() as UpdateQuery<any>;
        const doc = updateParams;

        if (!doc) return;
        self['$denormalize'] = shouldDenormalize;

        // const updateField = updateParams.$set || {};

        const ignoredFields = ['createdAt', 'updatedAt', '__v'] as string[];

        ignoredFields.forEach(key => {
          delete updateParams[key];
        });

        delete doc['$set'];
        delete doc['$setOnInsert'];

        console.log(`PLUGIN: polymorphicConsumer , op: ${self.op} doc `, doc);

        const ModelType: string =
          fixedProvider || doc[fromRef] || doc[fromRefPath];
        const LocalValue = doc[morphKey] || doc[localKey];

        if (!toPath || !LocalValue || !ModelType) return;

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

        if (denormWhen && doc[denormWhen['field']]) {
          if (denormWhen['is'] && denormWhen['is'] != doc[denormWhen['field']])
            return;
          if (denormWhen['ne'] && denormWhen['ne'] == doc[denormWhen['field']])
            return;
          if (
            denormWhen['in'] &&
            !denormWhen['in'].includes(doc[denormWhen['field']])
          )
            return;
          if (
            denormWhen['nin'] &&
            denormWhen['nin'].includes(doc[denormWhen['field']])
          )
            return;
        }

        if (!ModelType) {
          // return next(new Error(`${fromRef || fromRefPath} is required`));
          return;
        }

        if (
          !inArray &&
          polymorphic &&
          shouldDenormalize &&
          !!doc &&
          (!!LocalValue || !!ModelType)
        ) {
          let ProviderModel: any;

          if (modelSwitcher && modelSwitcher[ModelType]) {
            ProviderModel = model(modelSwitcher[ModelType]);
          } else {
            if (morphSchemaMap && !morphSchemaMap[ModelType]) {
              return next(
                new Error(
                  `${ModelType} is not available on morphSchemaMap's schema.Please define schema for this modelType`
                )
              );
            } else if (
              availableProviders &&
              !availableProviders.includes(ModelType)
            ) {
              return next(
                new Error(
                  `${ModelType} is not available on morphSchemaMap's schema.Please define schema for this modelType`
                )
              );
            }

            ProviderModel = model(ModelType);
          }

          /**
           *  Step-2: get Provider model instance & value ProviderModel({_id: modelId }).
           *  here [ProviderModel]({ [foreignKey]: localValue })
           */
          const provider: Record<
            string,
            any
          > | null = await ProviderModel.findOne(
            { [foreignKey]: LocalValue },
            { createdAt: 0, updatedAt: 0 }
          );

          if (!provider) {
            if (strict || exceptionOnFailure) {
              return next(
                new Error(
                  `Denormalization failed for foreignKey:${foreignKey}, value: ${LocalValue} field: ${toPath}, plugin: polymorphicConsumer , method: ${self.op}`
                )
              );
            } else {
              return next();
            }
          }

          let updateDenormedData: Record<string, any> = {};

          if (morphSchemaMap) {
            /**
                     morphSchemaMap: {
                          Artist: new Schema({
                              _id: {  type: Schema.Types.ObjectId },
                              name: String,
                              slug: String,
                              avatar: String,
                            }),
                          Genre: new Schema({
                              _id: {  type: Schema.Types.ObjectId },
                              title: String,
                              slug: String
                            }),
                      },
                     */
            const morphSchemaKeys = Object.keys(
              morphSchemaMap[ModelType].paths
            );

            const processor: Record<string, any> = {};
            const flattenProvider = flattenObj(provider.toObject());

            morphSchemaKeys.forEach((key: any) => {
              processor[key] = flattenProvider[key];
            });

            as &&
              Object.entries(as).forEach(([key, value]) => {
                if (flattenProvider[value]) {
                  processor[key as string] = flattenProvider[value];
                }
              });
            updateDenormedData = unflattenObj(processor);
          } else {
            updateDenormedData = provider.toObject();
          }

          if (as) {
            const flattenProvider = flattenObj(provider.toObject());
            // doc[toPath] = flattenProvider || { [foreignKey]: LocalValue };

            let aliasMappedObject: Record<string, any> = {};

            Object.entries(as).forEach(([key, value]) => {
              if (flattenProvider[value]) {
                aliasMappedObject[key as string] = flattenProvider[value];
              }
            });

            aliasMappedObject = unflattenObj({
              ...flattenProvider,
              ...aliasMappedObject,
            });

            doc[toPath] = aliasMappedObject;

            if (withTimestamp) {
              doc['denormalizedAt'] = new Date().toISOString();
            }
            return next();
          }

          // Step-3: set denormmalized value on polymorphicConsumer
          doc[toPath] = updateDenormedData;

          if (withTimestamp) {
            doc['denormalizedAt'] = new Date().toISOString();
          }
          return next();
        }
      }
    );

    /**
     * onUpdateConsumer
     */

    // schema.post(
    //   Object.keys(updateQueryMethods) as MongooseQueryMiddleware[],
    //   // eslint-disable-next-line @typescript-eslint/ban-types
    //   async function (doc: Record<string, any>, next: Function) {
    //     const self = this as any;
    //     // const doc = self.getUpdate() as UpdateQuery<any>;
    //     // const updateField = updateParams.$set || {};
    //     const Provider =
    //       fixedProvider ||
    //       (options.fromRef && doc[options.fromRef]) ||
    //       (options.fromRefPath && doc[options.fromRefPath]) ||
    //       'Not recognised';

    //     const Consumer = self.model.modelName;

    //     try {
    //       console.log({
    //         hook: 'publish consumer',
    //         $denormalize: !!self['$denormalize'],
    //         toPath,
    //         publishConsumer: Consumer,
    //         publishedProvider: Provider,
    //       });
    //       return next();
    //     } catch (error: any) {
    //       return next(
    //         new Error(
    //           `method: ${self.op}, plugin: polymorphicConsumer,toPath: ${toPath}, consumer: ${Consumer}, provider: ${Provider} failed`,
    //         ),
    //       );
    //     }
    //   },
    // );
    // onUpdateConsumer
  };
};
