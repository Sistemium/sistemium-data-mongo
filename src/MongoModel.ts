import { Model, ModelConfig } from 'sistemium-data'
import * as mongoose from 'sistemium-mongo/lib/mongoose'
import MongoStoreAdapter from './MongoStoreAdapter'
import { CommonFieldsPlugin, BaseItem } from 'sistemium-data'
import mapValues from 'lodash/mapValues'
import fpOmitBy from 'lodash/fp/omitBy'

import { omitBy } from 'lodash'

const INTERNAL_FIELDS_RE = /^(_.*|cts|ts)$/
const omitInternal = fpOmitBy((val: any, key) =>
  INTERNAL_FIELDS_RE.test(key),
)

export const adapter = new MongoStoreAdapter({ mongoose: mongoose.mongoose })

export class MongoModel<T extends BaseItem> extends Model<T> {
  normalizeItem(
    item: BaseItem,
    defaults: BaseItem = {},
    overrides: BaseItem = {},
  ): BaseItem {
    const { schema } = this
    const all = mapValues(schema, (keySchema: BaseItem, key) => {
      const res = ifUndefined(
        overrides[key],
        ifUndefined(item[key], defaults[key]),
      )
      if (res === undefined) {
        if (keySchema.patch || keySchema.default) {
          return res
        }
        return null
      }
      return res
    })
    return omitBy(omitInternal(all), (val, key) => !schema[key])
  }

  constructor(config: ModelConfig) {
    const { schema = {} } = config
    super({ ...config, schema: { id: String, ...schema } })
  }

  async updateMany(filter: object, props: Partial<T>): Promise<void> {
    await adapter
      .getStoreModel(this.collection)
      .updateMany(filter, { $set: props })
  }

}

MongoModel.useStoreAdapter(adapter).plugin(new CommonFieldsPlugin())

export async function connect() {
  return mongoose.connect()
}

export async function disconnect() {
  return mongoose.disconnect()
}

function ifUndefined(val1: any, val2: any) {
  return val1 === undefined ? val2 : val1
}
