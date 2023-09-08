export const mongoose: any;
export const ARRAY_FILTERS_OPTION: "arrayFilters";
export const ARRAY_PUSH_OPTION: "arrayPush";
export const MONGO_SESSION_OPTION: "mongoSession";
export default class MongoStoreAdapter {
    constructor(options?: {});
    mongoose: any;
    omitInternal(obj: any): any;
    connect(url?: string): any;
    disconnect(): any;
    mongooseModel(name: any, schema: any, options?: {}): any;
    setupModel(name: any, { schema, indexes }: {
        schema: any;
        indexes?: any[];
    }): void;
    requestAdapter(config: any): Promise<any>;
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
    offsetFromArray(data: any): any;
    offsetFromRecord(obj: any): any;
    offsetToFilter(offset: any): {
        ts: {
            $gt: any;
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
