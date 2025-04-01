import lo from 'lodash'
import { mongoose } from 'sistemium-mongo/lib/mongoose'
import {
  Model,
  OFFSET_HEADER,
  SORT_HEADER,
  FULL_RESPONSE_OPTION,
} from 'sistemium-data'
import CommonFieldsPlugin from 'sistemium-data/lib/plugins/CommonFieldsPlugin'
import { assert, expect } from 'chai'
import MongoStoreAdapter, {
  MONGO_INCREMENT_OPTION,
  PAGE_SIZE_HEADER,
  PRE_PIPE_OPTION,
} from '../src/MongoStoreAdapter'
import personData from './personData'
import { clearMockMongo, initMockMongo } from './mockMongo'

const people = personData().map(item => lo.omit(item, OFFSET_HEADER))

const storeAdapter = new MongoStoreAdapter({ mongoose })

class MongoModel extends Model {}

MongoModel.useStoreAdapter(storeAdapter).plugin(new CommonFieldsPlugin())

const Person = new MongoModel({
  collection: 'Person',
  schema: {
    id: String,
    name: String,
    age: Number,
    fatherId: String,
    children: [],
  },
})

describe('Mongo Model', function () {
  before(async function () {
    const uri = await initMockMongo()
    await mongoose.connect(uri, { dbName: 'verifyMASTER' })
  })

  beforeEach(clearMockMongo)

  it('should respond 204', async function () {
    const { status, data } = await Person.find(
      {},
      { [FULL_RESPONSE_OPTION]: true },
    )

    expect(status).equals(204)
    expect(data).to.eql([])
  })

  it('should store data', async function () {
    const props = people[0]

    const created = await Person.createOne(props)
    expect(created).to.deep.include(props)

    await Person.createOne(people[1])

    const found = await Person.findByID(props.id)
    // console.log('found', found);
    expect(found, 'found object is not equal to created').to.eql(created)

    const foundArray = await Person.find([{ id: props.id }])
    expect(foundArray).to.eql([created])

    const updated = await Person.updateOne({ ...props, fatherId: null })
    expect(updated.fatherId).equals(null)
  })

  it('should not update non existing data', async function () {
    try {
      await Person.updateOne({ id: 'null', fatherId: null })
    } catch (e: any) {
      expect(e.message).equals('Request failed with status code 404')
    }
  })

  it('should rollback transactions', async function () {
    try {
      const session = await storeAdapter.startSession('Person')
      storeAdapter.startTransaction(session)
      const opts = { headers: { mongoSession: session } }
      const ids = await Person.merge(people, opts)
      const merged = await Person.find({ id: { $in: ids } }, opts)
      expect(merged.length).equals(2)
      await storeAdapter.abortTransaction(session)
      const empty = await Person.find({ id: { $in: ids } }, opts)
      expect(empty).eql([])
      storeAdapter.endSession(session)
    } catch (e: any) {
      expect(e.message).to.eql(null)
    }
  })

  it('should commit transactions', async function () {
    try {
      const session = await storeAdapter.startSession('Person')
      storeAdapter.startTransaction(session)
      const opts = { headers: { mongoSession: session } }
      const ids = await Person.merge(people, opts)
      const merged = await Person.find({ id: { $in: ids } }, opts)
      expect(merged.length).equals(2)
      await new Promise((resolve, reject) => {
        let ready = false
        Person.find({ id: { $in: ids } }).then(empty1 => {
          try {
            ready = true
            expect(empty1.length).equals(2)
            resolve(true)
          } catch (e) {
            reject(e)
          }
        })
        storeAdapter
          .commitTransaction(session)
          .then(() => {
            expect(ready).to.be.false
          })
          .catch(reject)
      })
      storeAdapter.endSession(session)
    } catch (e: any) {
      expect(e.message).to.eql(null)
    }
  })

  it('should update with arrayFilters', async function () {
    try {
      const id = 'arrayFilters'
      const children = [
        { name: 'child1', age: 10 },
        { name: 'child2', age: 12 },
      ]
      await Person.create({ id, children })
      const arrayFilters = [{ 'element.name': 'child2' }]
      const props = { id, 'children.$[element].age': 13 }
      const person = await Person.updateOne(props, {
        headers: { arrayFilters },
      })
      expect(person.children[1].age).equals(13)
    } catch (e: any) {
      expect(e.message).to.eql(null)
    }
  })

  it('should increment', async function () {
    try {
      const children = [
        { id: 'child1', age: 10 },
        { id: 'child2', age: 12 },
      ]
      await Person.merge(children)
      const headers = { [MONGO_INCREMENT_OPTION]: { age: -3 } }
      const person = await Person.updateOne({ id: 'child2' }, { headers })
      expect(person.age).equals(9)
    } catch (e: any) {
      expect(e.message).to.eql(null)
    }
  })

  it('should push into arrays', async function () {
    try {
      const id = 'arrayPush'
      const children = [
        { name: 'child1', age: 10 },
        { name: 'child2', age: 12 },
      ]
      await Person.create({ id, children })
      const $not = { $elemMatch: { name: 'child3' } }
      const arrayPush = { children: { name: 'child3', age: 13 } }
      const filter = { id, children: { $not } }
      const person = await Person.updateOne(filter, { headers: { arrayPush } })
      expect(person.children[2]).include(arrayPush.children)
      const empty = await Person.updateOne(filter, {
        headers: { arrayPush },
      }).catch(e => {
        expect(e.message).equals('Request failed with status code 404')
      })
      expect(empty).to.be.undefined
    } catch (e: any) {
      expect(e.message).to.eql(null)
    }
  })

  it('should pull from arrays', async function () {
    try {
      const id = 'arrayPull'
      const children = [
        { name: 'child1', age: 10 },
        { name: 'child2', age: 12 },
      ]
      await Person.create({ id, children })
      const arrayPull = { children: { name: 'child2' } }
      const filter = { id }
      const person = await Person.updateOne(filter, { headers: { arrayPull } })
      expect(person.children.length).equal(1)
    } catch (e: any) {
      expect(e.message).to.eql(null)
    }
  })

  it('should merge and delete data', async function () {
    const ids = await Person.merge(people)
    // console.log('ids', ids);
    expect(ids).to.be.eql(people.map(({ id }) => id))

    await Person.destroy(ids[0])
    await Person.deleteOne({ id: ids[1] })
    const deleted = await Person.find({ id: { $in: lo.take(ids, 2) } })
    expect(deleted).to.eql([])
  })

  it('should merge and aggregate data', async function () {
    const ids = await Person.merge(people)
    // console.log('ids', ids);

    try {
      const pipeline = [{ $match: { id: { $in: lo.take(ids, 2) } } }]
      const aggregated = await Person.aggregate(pipeline)
      const found = await Person.find({})
      expect(aggregated).to.eql(found)
      const { status, data } = await Person.aggregate(pipeline, {
        [FULL_RESPONSE_OPTION]: true,
      })
      expect(data).to.eql(found)
      expect(status).to.eql(200)
    } catch (e: any) {
      console.error(e)
      expect(e).to.be.empty
    }
  })

  it('should limit aggregate data', async function () {
    await Person.merge(people)
    const pipeline = [{ $sort: { id: 1 } }]
    const aggregated = await Person.aggregate(pipeline, {
      headers: { [PAGE_SIZE_HEADER]: 1 },
    })
    expect(aggregated.length).equals(1)
  })

  it('should aggregate using offset', async function () {
    await Person.merge(people)
    const pipeline = [{ $sort: { id: 1 } }]
    const { data, headers } = await Person.aggregate(pipeline, {
      headers: {
        [OFFSET_HEADER]: '*',
        [PAGE_SIZE_HEADER]: 1,
        [SORT_HEADER]: 'id',
      },
      [FULL_RESPONSE_OPTION]: true,
    })
    expect(data.length).equals(1)
    const offset = headers[OFFSET_HEADER]
    expect(offset).to.be.not.empty
    const next = await Person.aggregate(pipeline, {
      headers: { [OFFSET_HEADER]: offset },
    })
    expect(next.length).equals(1)
  })

  it('should aggregate using pre-pipe', async function () {
    await Person.merge(people)
    const pipeline = [{ $sort: { id: 1 } }, { $match: { pre: 1 } }]
    const { data } = await Person.aggregate(pipeline, {
      headers: {
        [OFFSET_HEADER]: '*',
        [PAGE_SIZE_HEADER]: 1,
        [SORT_HEADER]: 'id',
        [PRE_PIPE_OPTION]: [{ $set: { pre: 1 } }],
      },
      [FULL_RESPONSE_OPTION]: true,
    })
    expect(data.length).equals(1)
  })

  it('should limit find data', async function () {
    await Person.merge(people)
    const found = await Person.find({}, { headers: { [PAGE_SIZE_HEADER]: 1 } })
    expect(found.length).equals(1)
  })

  it('should fetch with offset', async function () {
    await Person.merge(people)
    const data = await Person.fetchAll()
    const { [OFFSET_HEADER]: offset } = data

    expect(offset).to.match(/^2-\d+$/)

    const emptyArray = await Person.fetchAll(
      {},
      { headers: { [OFFSET_HEADER]: offset } },
    )
    expect(emptyArray).to.eql([])
  })

  it('should sort', async function () {
    await Person.merge(people)

    const nameDesc = '-name,id'
    const nameAsc = 'name,id'

    const dataDesc = await Person.find(
      {},
      { headers: { [SORT_HEADER]: nameDesc } },
    )
    assert(dataDesc[0].name > dataDesc[1].name, 'Should be descending order')

    const dataAsc = await Person.find(
      {},
      { headers: { [SORT_HEADER]: nameAsc } },
    )
    assert(dataAsc[0].name < dataAsc[1].name, 'Should be ascending order')
  })

  it('should apply defaults on create', async function () {
    const person = await Person.create({ name: 'Name Without ID' })
    assert(person.id, 'Must be not null id')
  })

  it('should apply defaults on merge', async function () {
    const [personId] = await Person.merge([{ name: 'Name Without ID' }])
    assert(personId, 'Must be not null id')
  })

  after(async function () {
    await storeAdapter.disconnect()
  })
})
