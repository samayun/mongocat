import { Schema } from 'mongoose';

export interface IProvider {
  toRef?: string;
  keyFields?: string[];
  ignoredFields?: string[];
  // publish?: (data: any) => void;
}

export interface IConsumer {
  fromRef: string;
  toPath?: string;
  key?: string;
  as?: Record<string, any>;
  inArray?: boolean;
  withTimestamp?: boolean;
  toRef?: string; // string | undefined;
}

export interface IWatchConsumer {
  changeStreamEnabled?: boolean;
  key?: string;
  fromRef: string;
  toPath?: string;
  inArray?: boolean;
  strict?: boolean;
  exceptionOnFailure?: boolean;
  toRef: string; // string | undefined;
  // relationship?: string;
}

export interface IPolymorphicConsumer {
  availableProviders?: string[];
  localKey?: string; // default: modelId
  foreignKey?: string; // default: _id
  toRef: string; // for eventEmitter  & changeStream & third party source
  fromRefPath?: string;
  fixedProvider?: string;
  denormWhen?: {
    field: string;
    is?: string[];
    ne?: string[];
    in?: string[];
    nin?: string[];
  };
  toPath: string;
  morphSchemaMap?: Record<string, Schema>;
  modelSwitcher?: Record<string, string>;
  withTimestamp?: boolean;
  clean?: boolean;
  strict?: boolean;
  inArray?: boolean;
  polymorphic?: boolean;
  exceptionOnFailure?: boolean;
  as?: Record<string, string>;
  changeStreamEnabled?: boolean;
  // old
  morphKey?: string;
  fromRef?: string;
}

export interface IPolymorphicArrayConsumer {
  toPathNestedField: string; // 'artist';
  availableProviders?: string[];
  localKey?: string; // default: modelId
  foreignKey?: string; // default: _id
  toRef: string; // for eventEmitter  & changeStream & third party source
  fromRefPath?: string;
  fixedProvider?: string;
  toPath: string;
  morphSchemaMap?: Record<string, Schema>;
  withTimestamp?: boolean;
  clean?: boolean;
  strict: boolean;
  inArray?: boolean;
  as?: Record<string, string>;
  changeStreamEnabled?: boolean;
  polymorphic?: boolean; // default: true
}
