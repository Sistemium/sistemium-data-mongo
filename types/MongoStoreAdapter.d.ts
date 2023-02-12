export const mongoose: any;
export const ARRAY_FILTERS_OPTION: "arrayFilters";
export default class MongoStoreAdapter {
    constructor(options?: {});
    mongoose: any;
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
    mergeFn(mongooseModel: any, data: any, mergeBy?: any[]): Promise<any[]>;
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
    find(mongooseModel: any, filter?: {}, options?: {}): Promise<any>;
    aggregate(mongooseModel: any, pipeline?: any[], options?: {}): Promise<any>;
    sortFromHeader(sortHeader?: string): {};
    offsetFromArray(data: any): any;
    toObject(record: any): any;
}
