export const mongoose: typeof defaultMongoose;
export const ARRAY_FILTERS_OPTION: "arrayFilters";
export const ARRAY_PUSH_OPTION: "arrayPush";
export const MONGO_SESSION_OPTION: "mongoSession";
export const MONGO_INCREMENT_OPTION: "increment";
export default class MongoStoreAdapter extends StoreAdapter {
    /**
     * Setup
     * @param {Object} options
     * @param {import('mongoose')} [options.mongoose]
     */
    constructor(options?: {
        mongoose?: typeof defaultMongoose;
    });
    mongoose: typeof defaultMongoose;
    omitInternal(obj: any): any;
    connect(url?: string): Promise<typeof defaultMongoose>;
    disconnect(): Promise<void>;
    /**
     *
     * @param {string} name
     * @param {object} schema
     * @param {object} [options]
     * @returns {mongoose}
     */
    mongooseModel(name: string, schema: object, options?: object): typeof defaultMongoose;
    transformRequest(data: any): any;
    transformResponse(data: any): any;
    mergeFn(mongooseModel: any, data: any, mergeBy?: any[], mongoOptions?: {}): Promise<any[]>;
    $setOnInsertFields(mongoModel: any): string[];
    $updateOne(props: any, id: any, filter: any, onInsertFields: any, upsert?: boolean): {
        filter: any;
        update: {
            $set: any;
            $unset: any;
            $setOnInsert: any;
            $currentDate: {
                ts: {
                    $type: string;
                };
            };
        };
        upsert: boolean;
    };
    startTransaction(session: any): void;
    abortTransaction(session: any): Promise<void>;
    commitTransaction(session: any): Promise<void>;
    startSession(collection: any): Promise<any>;
    endSession(session: any): void;
    find(mongooseModel: any, filterArg?: {}, options?: {}, mongoOptions?: {}): Promise<any>;
    aggregate(mongooseModel: any, pipeline?: any[], options?: {}, mongoOptions?: {}): Promise<any>;
    sortFromHeader(sortHeader?: string): {};
    offsetFromArray(data: any): string;
    offsetFromRecord(obj: any): string;
    offsetToFilter(offset: any): {
        ts: {
            $gt: defaultMongoose.mongo.BSON.Timestamp;
        };
    };
    offsetSort(): {
        ts: number;
    };
    $currentDate(): {
        ts: {
            $type: string;
        };
    };
    toObject(record: any): any;
}
import { mongoose as defaultMongoose } from "sistemium-mongo/lib/mongoose";
import { StoreAdapter } from "sistemium-data";
