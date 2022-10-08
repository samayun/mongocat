/* eslint-disable no-prototype-builtins */
import {
  Types,
  model,
  MongooseQueryMiddleware,
  Schema,
  UpdateQuery,
} from 'mongoose';
import { IWatchConsumer } from '../types';
import { flattenObj } from '../utils/flatten';
import { ObjectBuilder } from '../utils/filter';
import { denormalizeEmitter, updateQueryMethods } from '..';

/**
 * It's used on ConsumerModel
 * @param options = {
      key: '_id',
      fromRef: 'Category', // make default: toPath = category
      inArray: true // if it's like genres
    }
 * @returns 
 */

export const watchConsumer = (ops: IWatchConsumer) => {
  const options = ops || {};
  options.toPath = options.toPath || options.fromRef.toLowerCase();
  return (schema: Schema) => {
    const {
      toPath,
      key = '_id',
      fromRef,
      exceptionOnFailure = false,
      toRef,
      inArray = false,
      strict = false,
    } = options;

    if (!toPath) return;

    /***
     * Event emit after provider publishing
     */
    denormalizeEmitter.on(
      `denormalize/publish/${fromRef}`,
      async (data: any) => {
        // Step-1: Get Model instance
        // const ProviderModel = model(options.fromRef);
        const ConsumerModel = model(options.toRef);

        // Step-2: Get updatable key from Provider
        const _docData = data?._doc ? data?._doc : data;

        const flattenPublishedData = _docData;

        // Step-3: Get updatable key on consumer
        const schemaFeilds = Object.keys(schema.paths);

        console.log({ flattenPublishedData });

        const filteredFlattenedData = ObjectBuilder.filterObject(
          flattenPublishedData,
          (_, k) => schemaFeilds.includes(k),
          value => !(value instanceof Types.ObjectId) && Object(value)
        );

        //TODO: get denormable keys first like GQL

        // Step-4: Update ConsumerModel

        const filterKey = `${toPath}.${key}`;

        const filterQuery = {
          [filterKey]: data[key],
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

        await ConsumerModel.updateMany(filterQuery, updateFlattenData, {
          new: true,
        });

        console.info(
          '\x1b[47m\x1b[46m%s\x1b[0m',
          `✨ Successfully denormalized via hook watchConsumer event emitted ✨`,
          '\x1b[1m\x1b[4m',
          `toRef: ${toRef}, from provider: ${fromRef}, toPath: ${toPath}, inArray: ${inArray} 🐦`
        );
      }
    );

    /***
     * Event emit after provider publishing
     */
    if (fromRef && options.changeStreamEnabled) {
      console.log(
        `CHANGE STREAM: ${options.toRef} > ${toPath} << provider: ${options.fromRef}`
      );
      process.nextTick(() => {
        const ConsumerModel = model(options.toRef);
        const ProviderModel = model(options.fromRef);

        let cursor: any;
        try {
          //FIXME: test it using local unsupported DB
          cursor = ProviderModel.watch();
        } catch (error) {
          cursor = null;
          throw new Error(`Change Stream not supported`);
        }

        // ChangeStreamDocument<any>
        if (cursor) {
          cursor.on('change', async (change: any) => {
            console.log(`${options.fromRef} is called for ${options.toRef}`);

            if (change.operationType === 'update') {
              const updatedData = change.updateDescription?.updatedFields || {};
              if (options.inArray) {
                const matchedKeys = Object.keys(
                  schema.paths[toPath]?.schema?.paths
                );

                const updateDenormedData: Record<string, any> = {};
                const flattenProvider = flattenObj(updatedData);

                matchedKeys.forEach((key: string) => {
                  updateDenormedData[key] = flattenProvider[key];
                });

                // const providerId: any = change.documentKey?._id as unknown as any;
                const providerId = change.documentKey?._id as any;

                if (!providerId) return;

                try {
                  const contentQuery = {
                    [`${toPath}.${key}`]: providerId,
                  };
                  const contentUpdateBody = flattenObj({
                    [`${toPath}.$`]: updateDenormedData,
                  });

                  console.log(contentQuery, contentUpdateBody);
                  await ConsumerModel.updateMany(
                    contentQuery,
                    contentUpdateBody
                  );

                  console.info(
                    '\x1b[47m\x1b[46m%s\x1b[0m',
                    `✨ Successfully denormalized from changeStream ✨`,
                    `toRef: ${options.toRef}, from provider: ${options.fromRef}, toPath: ${options.toPath} 🐦`
                  );
                  // CALL AFTER UPDATE HOOK
                } catch (error) {
                  console.log(
                    `Failed to denormalize error by changeStream on mongoose, Model:${options.toRef},Field: ${options.toPath}`,
                    error.message
                  );
                  await cursor.close();
                }
              } else if (!options.inArray) {
                const matchedKeys = Object.keys(
                  schema.paths[toPath]?.schema?.paths
                );

                const updateDenormedData: Record<string, any> = {};
                const flattenProvider = flattenObj(updatedData);

                matchedKeys.forEach((key: string) => {
                  updateDenormedData[key] = flattenProvider[key];
                });

                // const providerId: any = change.documentKey?._id as unknown as any;
                const providerId = change.documentKey?._id as any;

                if (!providerId) return;

                try {
                  const contentQuery = {
                    [`${toPath}.${key}`]: providerId,
                  };
                  const contentUpdateBody = flattenObj({
                    [toPath]: updateDenormedData,
                  });

                  console.log(contentQuery, contentUpdateBody);
                  await ConsumerModel.updateMany(
                    contentQuery,
                    contentUpdateBody
                  );
                  // CALL AFTER UPDATE HOOK

                  console.info(
                    '\x1b[47m\x1b[46m%s\x1b[0m',
                    `✨ Successfully denormalized from changeStream✨`,
                    `toRef: ${options.toRef}, from provider: ${options.fromRef}, toPath: ${options.toPath} 🐦`
                  );
                } catch (error) {
                  console.log(
                    `Failed to denormalize error by changeStream on mongoose, Model:${options.toRef},Field: ${options.toPath}`,
                    error.message
                  );
                  await cursor.close();
                }
              }
            }
          });
          cursor.on('error', async () => {
            await cursor.close();
            console.log(`Change Stream not supported`);
          });
        }
      });
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    schema.pre(['save'], async function(next: Function) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const doc: any = this;
      // if (!this[toPath] || !this[relationship as string] || !doc[toPath][key]) return;
      // next(new Error(`to path nai`));

      if ((this.isNew || this.isModified(toPath)) && this[toPath]) {
        const msg = {
          plugin: 'watchConsumer',
          method: 'pre save',
          provider: fromRef,
          consumer: toPath,
          inArray,
          doc,
          isNew: this.isNew,
          isModified: {
            [toPath]: this.isModified(toPath),
          },
        };
        console.log(msg);

        if (!inArray && this[toPath] && this[toPath][key]) {
          // Step-2: get provided data;
          const ProviderModel = model(fromRef);

          const filterQuery = { [key]: this[toPath][key] };

          const provider: Record<
            string,
            any
          > | null = await ProviderModel.findOne(filterQuery, {
            createdAt: 0,
            updatedAt: 0,
          });

          if (!provider) {
            if (strict || exceptionOnFailure) {
              return next(
                new Error(
                  `Denormalization failed for key: ${key}, 
                          value: ${this[toPath][key]}, PLUGIN: watchConsumer ,
                           METHOD: save, consumer: ${toPath}, provider: ${fromRef}`
                )
              );
            } else {
              return next();
            }
          }

          // Step-3: set denormmalized value on field on watchConsumer
          Object.assign(this[toPath], provider?.toObject());
          return next();
        } else if (inArray && this[toPath]) {
          const groupArray = doc[toPath]
            ?.filter((data: any) => data[key])
            ?.map((value: any) => value[key]);

          if (!this[toPath] || !groupArray || !groupArray.length) {
            delete this[toPath]; // I even don't what will be it's effect
            if (strict || exceptionOnFailure) {
              return next(
                new Error(
                  `Denormalization failed for feild: ${toPath}, array: ${groupArray}, PLUGIN: watchConsumer, METHOD: save,consumer: ${this.model}, provider: ${fromRef}`
                )
              );
            } else {
              return next();
            }
          }

          console.log('PLUGIN: watchConsumer , METHOD: update on: inArray ');

          const ProviderModel = model(fromRef);
          /**
           * FIXME: if change consumer sub schema then fetch from provider
           *  else DO NOTHING
           */

          const providers: Record<
            string,
            any
          > | null = await ProviderModel.find({
            [key]: { $in: groupArray },
          });

          if (!providers.length) {
            if (strict || exceptionOnFailure) {
              return next(
                new Error(
                  `Denormalization failed for feild: ${toPath}, array: ${groupArray}, PLUGIN: watchConsumer, METHOD: save, provider: ${fromRef}`
                )
              );
            } else {
              return next();
            }
          }
          /**
                   * Consumer Update
                   * { _id: 62960300da98cc1aba3e9ff2 } // doc['_id']
                   * { users: [
                          {
                          *   _id: 62960300da98cc1aba3e9ff2,
                          *   name: Samayun Chowdhury
                          *   username: samayunchy
                          * },
                          * {
                          *   _id: 62a9c113382dec8e79c02178,
                          *   name: AzadChowdhury
                          *   username: azad
                          * }
                   * ]}
                   */
          // Step-3: set denormmalized value on field on watchConsumer
          Object.assign(this[toPath], providers);
          return;
        }
        return next();
      }
    });

    // eslint-disable-next-line  @typescript-eslint/ban-types
    // schema.post(['save'], async function (doc: Record<string, any>, next: Function) {
    //   console.log(`post hook on watchConsumer`, this.isModified(doc[toPath]));
    //   next();
    // });

    /**
     * VALIDATE CONSUMER UPDATE FIELD
     */
    schema.pre(
      Object.keys(updateQueryMethods) as MongooseQueryMiddleware[],
      async function(next: any) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self: any = this;
        if (!self) return;

        // const shouldDenormalize = !!self.options['denormalize']; // {denormalize: true}
        const shouldDenormalize = !self.options['denormalize']
          ? self.options['denormalize']
          : true;
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

        if (!inArray && shouldDenormalize && !!doc && !!doc[toPath]) {
          const denormableFeildsPrimaryKey = `${toPath}.${key}`;
          const denormableFeildsPrimaryValue = doc[denormableFeildsPrimaryKey]
            ? doc[denormableFeildsPrimaryKey]
            : doc[toPath][key];

          if (!!doc[toPath] && !!doc[toPath][key]) {
            console.log({
              plugin: 'watchConsumer',
              method: 'pre findOneAndUpdate',
              provider: fromRef,
              consumer: toRef,
              inArray,
              toPath,
              key,
              doc,
            });

            const ProviderModel = model(fromRef);

            const provider: Record<
              string,
              any
            > | null = await ProviderModel.findOne({
              [key]: denormableFeildsPrimaryValue,
            });

            if (!provider) {
              if (strict || exceptionOnFailure) {
                return next(
                  new Error(
                    `Denormalization failed for toPath:${toPath}, value:${denormableFeildsPrimaryValue} plugin: watchConsumer, method: findOneAndUpdate on: !inArray`
                  )
                );
              } else {
                return next();
              }
            }

            console.log(
              '\x1b[47m\x1b[46m%s\x1b[0m',
              `Denormalizing on feild: ${toPath} , queryKey: ${denormableFeildsPrimaryKey} bodyValue: ${denormableFeildsPrimaryValue}`
            );

            /**
             * Consumer Update
             * { user._id: 62960300da98cc1aba3e9ff2 }
             * { user: {
             *   _id: 62960300da98cc1aba3e9ff2,
             *   name: Samayun Chowdhury
             *   username: samayunchy
             * }}
             */
            // await this.model.updateMany(
            //   { [denormableFeildsPrimaryKey]: denormableFeildsPrimaryValue },
            //   { [toPath as string]: provider?.toObject() },
            // );
            // Object.assign(doc[toPath], provider?.toObject());
            doc[toPath] = provider?.toObject();
            return next();
          }
          return next();
        } else if (inArray && shouldDenormalize && !!doc && !!doc[toPath]) {
          console.log({
            plugin: 'watchConsumer',
            method: 'pre findOneAndUpdate',
            provider: fromRef,
            consumer: toRef,
            toPath: toPath,
          });
          console.log(
            `PLUGIN: watchConsumer, METHOD: findOneAndUpdate TYPE: PRE HOOK on: inArray path: ${toPath} data: ${updateParams[toPath]}`
          );
          console.log({
            updateParams,
            'updateParams[toPath]': updateParams[toPath],
          });

          const updateFields = updateParams[toPath as string] || [];
          if (!updateFields || !updateFields.length) {
            return next();
          }

          const groupArray = updateFields
            ?.filter((data: any) => data[key])
            ?.map((value: any) => value[key]);

          if (!groupArray.length) {
            // delete doc[toPath];
            return next(
              new Error(
                `Denormalization failed on watchConsumer inArray portion for ${key} array: ${groupArray}. WRONG KEY INPUT FROM FRONTEND`
              )
            );
          }

          const ProviderModel = model(fromRef);
          const providers: Record<
            string,
            any
          > | null = await ProviderModel.find({
            [key]: { $in: groupArray },
          });

          if (!providers || !providers.length) {
            if (strict || exceptionOnFailure) {
              return next(
                new Error(
                  `Denormalization failed for feild: ${toPath}, array: ${groupArray}, PLUGIN: watchConsumer, METHOD: findOneAndUpdate, provider: ${fromRef}`
                )
              );
            } else {
              return next();
            }
          }

          // Object.assign(doc[toPath], providers);
          doc[toPath] = providers;
          return next();
        }
        return next();
      }
    );

    /**
     * onUpdateConsumer
     */

    // schema.post(
    //   Object.keys(updateQueryMethods) as MongooseQueryMiddleware[],
    //   // eslint-disable-next-line @typescript-eslint/ban-types
    //   async function (doc: Record<string, any>, next: Function) {
    //     try {
    //       const self = this as any;
    //       // const updateParams = self.getUpdate() as UpdateQuery<any>;
    //       // const updateField = updateParams.$set || {};

    //       console.log({
    //         hook: 'afterFetchProvider',
    //         $denormalize: !!self['$denormalize'],
    //         toPath,
    //         publishConsumer: toRef,
    //         publishedProvider: fromRef,
    //       });
    //       return next();
    //     } catch (error: any) {
    //       const self = this as any;
    //       return next(
    //         new Error(
    //           `method: ${self.op}, plugin: watchConsumer,toPath: ${toPath}, consumer: ${toRef}, provider: ${fromRef} failed`,
    //         ),
    //       );
    //     }
    //   },
    // );
  };
};
