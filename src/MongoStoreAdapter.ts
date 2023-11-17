// @ts-ignore
import { settle } from 'sistemium-data/src/util/axios'
import isObject from 'lodash/isObject'
import assert from 'assert'
import log from 'sistemium-debug'
import { StoreAdapter, Model } from 'sistemium-data'
import {
  mongoose as defaultMongoose,
  Schema,
  model as mongooseModel,
} from 'sistemium-mongo/lib/mongoose'
import * as m from 'sistemium-data'
import omit from 'lodash/omit'
import pick from 'lodash/pick'
import omitBy from 'lodash/omitBy'
import mapValues from 'lodash/mapValues'
import pickBy from 'lodash/pickBy'
import isString from 'lodash/isString'
import { timestampToOffset, offsetToTimestamp } from 'sistemium-mongo/lib/util'
import { OFFSET_HEADER, SORT_HEADER } from 'sistemium-data'
import each from 'lodash/each'
import toNumber from 'lodash/toNumber'
import { Mongoose, ClientSession } from 'mongoose'
import type {
  Model as MongooseModel,
  PipelineStage,
  UpdateQuery,
  QueryOptions,
} from 'mongoose'
import * as process from 'process'

export const mongoose = defaultMongoose
export const ARRAY_FILTERS_OPTION = 'arrayFilters'
export const ARRAY_PUSH_OPTION = 'arrayPush'
export const MONGO_SESSION_OPTION = 'mongoSession'
export const MONGO_INCREMENT_OPTION = 'increment'

type BaseItem = Record<string, any>

const { debug, error } = log('MongoAdapter')
const INTERNAL_FIELDS_RE = /^_/

function pickUndefined(obj: BaseItem): Record<string, 1> {
  return mapValues(
    pickBy(obj, val => val === undefined),
    () => 1,
  )
}

export const PAGE_SIZE_HEADER = 'x-page-size'

export interface MongoStoreOptions {
  mongoose: Mongoose
}

export interface ModelOptions {
  schema: BaseItem
  indexes: BaseItem[]
}

export interface RequestConfig {
  method: string
  op: string
  collection: string
  data: BaseItem | BaseItem[] | undefined
  resourceId?: string
  params?: BaseItem
  headers: BaseItem
}

export interface ResponseHeaders extends BaseItem {
  [OFFSET_HEADER]?: string
}

export interface FindOptions {
  [SORT_HEADER]?: string
  [OFFSET_HEADER]?: string
  [PAGE_SIZE_HEADER]?: string
}

export type AggregateOptions = FindOptions

type StoreModel = MongooseModel<any> &
  Model & {
    schema: {
      tree: BaseItem & {
        setOnInsert?: string[]
      }
    }
    toObject(): BaseItem
  }

const { MONGO_URL } = process.env

export default class MongoStoreAdapter extends StoreAdapter {
  /**
   * Setup
   */

  mongoose: Mongoose
  // @ts-ignore
  idProperty: string

  constructor(options: MongoStoreOptions) {
    super(options)
    this.mongoose = options.mongoose
  }

  getStoreModel(name: string): StoreModel {
    return this.models.get(name)
  }

  omitInternal(obj: BaseItem): BaseItem {
    return omitBy(obj, (val: any, key) => {
      return key !== this.idProperty && INTERNAL_FIELDS_RE.test(key)
    })
  }

  async connect(url = MONGO_URL) {
    return (this.mongoose || defaultMongoose).connect(`mongodb://${url}`)
  }

  async disconnect() {
    return (this.mongoose || defaultMongoose).disconnect()
  }

  private mongooseModel(
    name: string,
    schema: BaseItem,
    options: {
      indexes?: BaseItem[]
    } = {},
  ): MongooseModel<any> {
    const mongoSchema = new Schema(schema)
    mongoSchema.index({ [this.idProperty]: 1 }, { unique: true })
    mongoSchema.index({ ts: -1 })
    each(schema || {}, (type, key) => {
      if (key.match(/.+Id$/)) {
        mongoSchema.index({ [key]: 1 })
        return
      }
      if (type.unique) {
        mongoSchema.index({ [key]: 1 }, { unique: true })
      }
    })
    each(options.indexes || [], idx => mongoSchema.index(idx))
    return (this.mongoose ? this.mongoose.model : mongooseModel)(
      name,
      mongoSchema,
      name,
    )
  }

  setupModel(name: string, { schema, indexes }: ModelOptions) {
    const model = this.mongooseModel(name, schema, { indexes })
    super.setupModel(name, model)
  }

  async requestAdapter(config: RequestConfig) {
    const { method } = config
    const { op, collection, data: requestData } = config
    const model = this.getStoreModel(collection)
    const { resourceId, params = {}, headers = {} } = config
    const { idProperty } = this

    let status = 501
    let statusText = 'Not implemented yet'
    let data: BaseItem | BaseItem[] | undefined | null = null
    const responseHeaders: ResponseHeaders = {}
    const offsetRequested = headers[OFFSET_HEADER]
    const mongoOptions = { lean: true, session: undefined }

    if (headers[MONGO_SESSION_OPTION]) {
      mongoOptions.session = headers[MONGO_SESSION_OPTION]
    }

    try {
      switch (op) {
        case m.OP_FIND_ONE:
          debug(method, resourceId)
          assert(resourceId, 'Resource id is required for findOne')
          data = await model.findOne(
            { [idProperty]: resourceId },
            null,
            mongoOptions,
          )
          status = data ? 200 : 404
          break

        case m.OP_FIND_MANY:
          debug(method, params)
          const filter = Array.isArray(params) ? arrayToFilter(params) : params
          data = await this.find(model, filter, headers, mongoOptions)
          if (offsetRequested) {
            responseHeaders[OFFSET_HEADER] =
              this.offsetFromArray(data as BaseItem[]) || offsetRequested
          }
          status = data.length ? 200 : 204
          break

        case m.OP_AGGREGATE:
          debug(method, params)
          console.assert(
            Array.isArray(params),
            'Aggregate requires array pipeline',
          )
          data = await this.aggregate(
            model,
            params as PipelineStage[],
            headers,
            mongoOptions,
          )
          if (offsetRequested) {
            responseHeaders[OFFSET_HEADER] =
              this.offsetFromArray(data as BaseItem[]) || offsetRequested
          }
          status = data.length ? 200 : 204
          break

        case m.OP_UPDATE_ONE:
          debug(method, resourceId, requestData)
          assert(resourceId, 'Update requires resourceId')
          assert(isObject(requestData), 'Update requires object data')
          const updateOptions: QueryOptions = { new: true, ...mongoOptions }
          const updateFilter = { id: resourceId }
          const updateOperators: UpdateQuery<any> = {
            $currentDate: this.$currentDate(),
          }
          if (headers[ARRAY_FILTERS_OPTION]) {
            updateOptions.arrayFilters = headers[ARRAY_FILTERS_OPTION]
          }
          if (headers[ARRAY_PUSH_OPTION]) {
            updateOperators.$push = headers[ARRAY_PUSH_OPTION]
            Object.assign(updateFilter, requestData)
          } else {
            updateOperators.$set = requestData
          }
          if (headers[MONGO_INCREMENT_OPTION]) {
            updateOperators.$inc = headers[MONGO_INCREMENT_OPTION]
          }
          data = await model.findOneAndUpdate(
            updateFilter,
            updateOperators,
            updateOptions,
          )
          status = data ? 200 : 404
          break

        case m.OP_CREATE:
          debug(method, requestData)
          assert(isObject(requestData), 'Create requires object data')
          const [created] = await model.create(
            [
              {
                ...this.omitInternal(requestData),
                cts: new Date(),
              },
            ],
            mongoOptions,
          )
          data = await model.findOneAndUpdate(
            { _id: created?._id },
            { $currentDate: this.$currentDate() },
            { new: true, ...mongoOptions },
          )
          status = 201
          break

        case m.OP_MERGE:
          debug(method, requestData ? requestData.length : null)
          assert(Array.isArray(requestData), 'Merge requires array data')
          data = await this.mergeFn(
            model,
            requestData,
            [this.idProperty],
            mongoOptions,
          )
          status = 201
          break

        case m.OP_DELETE_ONE:
          debug(method, resourceId)
          assert(resourceId, 'Resource id is required for deleteOne')
          await model.deleteOne({ [idProperty]: resourceId }, mongoOptions)
          status = 204
          break

        default:
          debug(method)
      }

      statusText = ''
    } catch (e: any) {
      status = 503
      // console.error(e)
      statusText = (e as Error).message
      error(e)
    }

    return new Promise((resolve, reject) => {
      settle(resolve, reject, {
        data,
        status,
        headers: responseHeaders,
        statusText,
        config,
      })
    })
  }

  transformRequest(data: any) {
    return data
  }

  transformResponse(data: BaseItem | BaseItem[]) {
    const wasArray = Array.isArray(data)
    const response = (wasArray ? data : [data]).map((res: BaseItem) => {
      if (!res || isString(res)) {
        return res
      }
      // const res = o.toObject ? o.toObject() : o;
      const {
        ts,
      }: {
        ts?: {
          high?: number
        }
      } = res
      if (ts) {
        res[OFFSET_HEADER] = this.offsetFromRecord(res)
        if (ts.high) {
          res.ts = new Date(ts.high * 1000)
        }
      }
      return this.omitInternal(res)
    })
    return wasArray ? response : response[0]
  }

  private async mergeFn(
    mongooseModel: StoreModel,
    data: BaseItem[],
    mergeBy: string[] = [this.idProperty],
    mongoOptions = {},
  ) {
    const ids: string[] = []
    const onInsert = this.$setOnInsertFields(mongooseModel)

    const ops = data.map(props => {
      const item = new mongooseModel({ ...props }).toObject()
      const id = item[this.idProperty]
      const filter = pick(item, mergeBy)

      ids.push(id)

      return { updateOne: this.$updateOne(item, id, filter, onInsert) }
    })

    if (ops.length) {
      await mongooseModel.bulkWrite(ops, {
        ordered: false,
        ...mongoOptions,
      })
    }

    return ids
  }

  private $setOnInsertFields(mongoModel: StoreModel) {
    const { tree } = mongoModel.schema
    return Object.keys(tree).filter(key => tree[key].setOnInsert)
  }

  private $updateOne(
    props: BaseItem,
    id: string,
    filter: BaseItem,
    onInsertFields: string[],
    upsert = true,
  ) {
    const mergeBy = Object.keys(filter)
    const toOmit = ['ts', ...onInsertFields, this.idProperty, ...mergeBy]
    const $set = this.omitInternal(omit(props, toOmit))
    const $unset = pickUndefined($set)

    const update: UpdateQuery<any> = {
      $set: omit($set, Object.keys($unset)),
      $unset,
      $setOnInsert: {
        ...pick(props, onInsertFields),
        [this.idProperty]: id,
      },
      $currentDate: this.$currentDate(),
    }

    if (!Object.keys($unset).length) {
      delete update.$unset
    }

    if (!Object.keys(update.$set || {}).length) {
      delete update.$set
    }

    return {
      filter,
      update,
      upsert,
    }
  }

  startTransaction(session: ClientSession) {
    session.startTransaction()
  }

  async abortTransaction(session: ClientSession) {
    await session.abortTransaction()
  }

  async commitTransaction(session: ClientSession) {
    await session.commitTransaction()
  }

  async startSession(collection: string) {
    const mongooseModel = this.getStoreModel(collection)
    return mongooseModel.startSession()
  }

  endSession(session: ClientSession) {
    session.endSession()
  }

  private async find(
    mongooseModel: MongooseModel<any>,
    filterArg: BaseItem = {},
    options: FindOptions = {},
    mongoOptions = {},
  ): Promise<BaseItem[]> {
    const {
      [SORT_HEADER]: sort,
      [OFFSET_HEADER]: offset,
      [PAGE_SIZE_HEADER]: pageSize,
    } = options
    const filter = { ...filterArg }
    if (offset) {
      Object.assign(filter, this.offsetToFilter(offset))
    }
    debug('find', filter, options)
    const query = mongooseModel.find(filter, null, {
      strict: false,
      lean: true,
      ...mongoOptions,
    })
    if (offset) {
      query.sort(this.offsetSort())
    }
    if (sort) {
      query.sort(this.sortFromHeader(sort))
    }
    if (pageSize) {
      query.limit(parseInt(pageSize, 10) as number)
    }
    return query
  }

  private async aggregate(
    mongooseModel: MongooseModel<any>,
    pipeline: PipelineStage[] = [],
    options: AggregateOptions = {},
    mongoOptions = {},
  ) {
    const {
      [SORT_HEADER]: sort,
      [OFFSET_HEADER]: offset,
      [PAGE_SIZE_HEADER]: pageSize,
    } = options
    if (offset) {
      const tsMatch = { $match: this.offsetToFilter(offset) }
      if (offset !== '*') {
        pipeline.splice(0, 0, tsMatch)
      }
      pipeline.push({ $sort: this.offsetSort() })
    }
    if (sort) {
      pipeline.push({ $sort: this.sortFromHeader(sort) })
    }
    if (pageSize) {
      pipeline.push({ $limit: toNumber(pageSize) })
    }
    debug('aggregate', pipeline, options)
    return mongooseModel.aggregate(pipeline, mongoOptions)
  }

  private sortFromHeader(sortHeader = '') {
    const res: BaseItem = {}
    sortHeader.split(',').forEach(item => {
      debug('sortFromHeader', res, item)
      const [, minus, name] = item.match(/([+-]?)([^+-]+$)/) || []
      if (!name) {
        return
      }
      res[name] = minus === '-' ? -1 : 1
    })
    return res
  }

  protected offsetFromArray(data: BaseItem[]) {
    if (!data.length) {
      return null
    }
    const last = data[data.length - 1]
    return this.offsetFromRecord(last)
  }

  protected offsetFromRecord(obj: {
    ts?: {
      high: number
      low: number
    }
  }) {
    const { ts } = obj
    return ts && ts.high ? timestampToOffset(ts) : undefined
  }

  protected offsetToFilter(offset: string): BaseItem {
    return { ts: { $gt: offsetToTimestamp(offset) } }
  }

  protected offsetSort(): Record<string, 1> {
    return { ts: 1 }
  }

  protected $currentDate() {
    return { ts: { $type: 'timestamp' } }
  }
}

function arrayToFilter(array: BaseItem[]) {
  const res = {}
  array.forEach(filter => {
    Object.assign(res, filter)
  })
  return res
}
