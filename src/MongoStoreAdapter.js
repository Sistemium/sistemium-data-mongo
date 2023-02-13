import { settle } from 'sistemium-data/src/util/axios';
import isObject from 'lodash/isObject';
import assert from 'assert';
import log from 'sistemium-debug';
import StoreAdapter from 'sistemium-data/src/StoreAdapter';
import { mongoose as defaultMongoose, Schema, model as mongooseModel } from 'sistemium-mongo/lib/mongoose';
import * as m from 'sistemium-data/src/Model';
import omit from 'lodash/omit';
import pick from 'lodash/pick';
import fpOmitBy from 'lodash/fp/omitBy';
import mapValues from 'lodash/mapValues';
import pickBy from 'lodash/pickBy';
import isString from 'lodash/isString';
import { timestampToOffset, offsetToTimestamp } from 'sistemium-mongo/lib/util';
import { OFFSET_HEADER, SORT_HEADER } from 'sistemium-data/src/Model';
import each from 'lodash/each';

export const mongoose = defaultMongoose;
export const ARRAY_FILTERS_OPTION = 'arrayFilters';

const { debug, error } = log('MongoAdapter');
const INTERNAL_FIELDS_RE = /^_/;
const omitInternal = fpOmitBy((val, key) => INTERNAL_FIELDS_RE.test(key));
const pickUndefined = obj => mapValues(pickBy(obj, val => val === undefined), () => 1);
const PAGE_SIZE_HEADER = 'x-page-size';

export default class MongoStoreAdapter extends StoreAdapter {

  constructor(options = {}) {
    super();
    this.mongoose = options.mongoose;
  }

  connect(url = process.env.MONGO_URL) {
    return (this.mongoose || defaultMongoose).connect(`mongodb://${url}`);
  }

  disconnect() {
    return (this.mongoose || defaultMongoose).disconnect();
  }

  mongooseModel(name, schema, options = {}) {
    const mongoSchema = new Schema(schema);
    mongoSchema.index(this.idProperty, { unique: true });
    mongoSchema.index({ ts: -1 });
    each(schema || {}, (type, key) => {
      if (key.match(/.+Id$/)) {
        mongoSchema.index({ [key]: 1 });
        return;
      }
      if (type.unique) {
        mongoSchema.index({ [key]: 1 }, { unique: true });
      }
    });
    each(options.indexes || [], idx => mongoSchema.index(idx));
    return (this.mongoose ? this.mongoose.model : mongooseModel)(name, mongoSchema, name);
  }

  setupModel(name, { schema, indexes = [] }) {
    const model = this.mongooseModel(name, schema, { indexes });
    super.setupModel(name, model);
  }

  async requestAdapter(config) {

    const { method } = config;
    const { op, collection, data: requestData } = config;
    const model = this.getStoreModel(collection);
    const { resourceId, params = {}, headers = {} } = config;
    const { idProperty } = this;

    let status = 501;
    let statusText = 'Not implemented yet';
    let data = null;
    const responseHeaders = {};
    const offsetRequested = headers[OFFSET_HEADER];

    try {
      switch (op) {

        case m.OP_FIND_ONE:
          debug(method, resourceId);
          assert(resourceId, 'Resource id is required for findOne');
          data = await model.findOne({ [idProperty]: resourceId });
          status = data ? 200 : 404;
          break;

        case m.OP_FIND_MANY:
          debug(method, params);
          const filter = Array.isArray(params) ? arrayToFilter(params) : params;
          data = await this.find(model, filter, headers);
          if (offsetRequested) {
            responseHeaders[OFFSET_HEADER] = this.offsetFromArray(data) || offsetRequested;
          }
          status = data.length ? 200 : 204;
          break;

        case m.OP_AGGREGATE:
          debug(method, params);
          console.assert(Array.isArray(params), 'Aggregate requires array pipeline');
          data = await this.aggregate(model, params, headers);
          if (offsetRequested) {
            responseHeaders[OFFSET_HEADER] = this.offsetFromArray(data) || offsetRequested;
          }
          status = data.length ? 200 : 204;
          break;

        case m.OP_UPDATE_ONE:
          debug(method, resourceId, requestData);
          assert(resourceId, 'Update requires resourceId');
          assert(isObject(requestData), 'Update requires object data');
          const updateOptions = { new: true };
          if (headers[ARRAY_FILTERS_OPTION]) {
            updateOptions.arrayFilters = headers[ARRAY_FILTERS_OPTION];
          }
          data = await model.findOneAndUpdate(
            { id: resourceId },
            {
              $set: requestData,
              $currentDate: { ts: { $type: 'timestamp' } },
            },
            updateOptions,
          );
          status = data ? 200 : 404;
          break;

        case m.OP_CREATE:
          debug(method, requestData);
          assert(isObject(requestData), 'Create requires object data');
          data = await model.create({
            ...omitInternal(requestData),
            cts: new Date(),
          });
          data = await model.findOneAndUpdate(
            { _id: data._id },
            { $currentDate: { ts: { $type: 'timestamp' } } },
            { new: true }
          );
          status = 201;
          break;

        case m.OP_MERGE:
          debug(method, requestData ? requestData.length : null);
          assert(Array.isArray(requestData), 'Merge requires array data');
          data = await this.mergeFn(model, requestData);
          status = 201;
          break;

        case m.OP_DELETE_ONE:
          debug(method, resourceId);
          assert(resourceId, 'Resource id is required for deleteOne');
          await model.deleteOne({ [idProperty]: resourceId });
          status = 204;
          break;

        default:
          debug(method);
      }

      statusText = '';

    } catch (e) {
      status = 503;
      statusText = e.message;
      error(e);
    }

    return new Promise((resolve, reject) => {
      settle(resolve, reject, {
        data,
        status,
        headers: responseHeaders,
        statusText,
        config,
      });
    });

  }

  transformRequest(data) {
    return data;
  }

  transformResponse(data) {
    const wasArray = Array.isArray(data);
    const response = (wasArray ? data : [data]).map(o => {
      if (!o || isString(o)) {
        return o;
      }
      const res = o.toObject ? o.toObject() : o;
      const { ts } = res;
      if (ts && ts.high) {
        res.ts = new Date(ts.high * 1000);
        res[OFFSET_HEADER] = timestampToOffset(ts);
      }
      return omitInternal(res);
    });
    return wasArray ? response : response [0];
  }

  async mergeFn(mongooseModel, data, mergeBy = [this.idProperty]) {

    const ids = [];
    const onInsert = this.$setOnInsertFields(mongooseModel);

    const ops = data.map(props => {

      const item = new mongooseModel({ ...props }).toObject();
      const id = item[this.idProperty];
      const filter = pick(item, mergeBy);

      ids.push(id);

      return { updateOne: this.$updateOne(item, id, filter, onInsert) };

    });

    if (ops.length) {
      await mongooseModel.bulkWrite(ops, { ordered: false });
    }

    return ids;

  }

  $setOnInsertFields(mongoModel) {
    const { tree } = mongoModel.schema;
    return Object.keys(tree)
      .filter(key => tree[key].setOnInsert);
  }


  $updateOne(props, id, filter, onInsertFields, upsert = true) {

    const mergeBy = Object.keys(filter);
    const toOmit = ['ts', ...onInsertFields, this.idProperty, ...mergeBy];
    const $set = omitInternal(omit(props, toOmit));
    const $unset = pickUndefined($set);

    const update = {
      $set: omit($set, Object.keys($unset)),
      $unset,
      $setOnInsert: { ...pick(props, onInsertFields), [this.idProperty]: id },
      $currentDate: { ts: { $type: 'timestamp' } }
    };

    if (!Object.keys($unset).length) {
      delete update.$unset;
    }

    if (!Object.keys(update.$set).length) {
      delete update.$set;
    }

    return {
      filter,
      update,
      upsert,
    };

  }

  async find(mongooseModel, filter = {}, options = {}) {
    const {
      [SORT_HEADER]: sort,
      [OFFSET_HEADER]: offset,
      [PAGE_SIZE_HEADER]: pageSize,
    } = options;
    if (offset) {
      filter.ts = { $gt: offsetToTimestamp(offset) };
    }
    debug('find', filter, options);
    const query = mongooseModel.find(filter);
    if (offset) {
      query.sort({ ts: 1 });
    }
    if (sort) {
      query.sort(this.sortFromHeader(sort));
    }
    if (pageSize) {
      query.limit(parseInt(pageSize, 10));
    }
    return query;
  }

  async aggregate(mongooseModel, pipeline = [], options = {}) {
    const { [SORT_HEADER]: sort, [OFFSET_HEADER]: offset } = options;
    if (offset) {
      pipeline.splice(0, 0, { ts: { $gt: offsetToTimestamp(offset) } });
      pipeline.push({ $sort: { ts: 1 } });
    }
    if (sort) {
      pipeline.push({ $sort: this.sortFromHeader(sort) });
    }
    debug('aggregate', pipeline, options);
    return mongooseModel.aggregate(pipeline);
  }

  sortFromHeader(sortHeader = '') {
    const res = {};
    sortHeader.split(',')
      .forEach(item => {
        debug('sortFromHeader', res, item);
        const [, minus, name] = item.match(/([+-]?)([^+-]+$)/);
        if (!name) {
          return;
        }
        res[name] = minus === '-' ? -1 : 1;
      });
    return res;
  }

  offsetFromArray(data) {
    if (!data.length) {
      return null;
    }
    const { ts } = this.toObject(data[data.length - 1]);
    if (!ts) {
      return null;
    }
    return timestampToOffset(ts);
  }

  toObject(record) {
    return (record && record.toObject) ? record.toObject() : record;
  }

}

function arrayToFilter(array) {
  const res = {};
  array.forEach(filter => {
    Object.assign(res, filter);
  });
  return res;
}
