import { expect } from 'chai'
import { Context } from 'mocha'
import { mongoose } from 'sistemium-mongo/lib/mongoose'
import { Model, OFFSET_HEADER } from 'sistemium-data'
import { clearMockMongo, initMockMongo } from './mockMongo'
import DateOffsetAdapter from '../src/DateOffsetAdapter'
import { BaseItem } from '../src/MongoStoreAdapter'

const storeAdapter = new DateOffsetAdapter({ mongoose, idProperty: '_id' })

class MongoModelId extends Model {
}

MongoModelId.useStoreAdapter(storeAdapter)

const Person = new MongoModelId({
  collection: 'PersonId',
  schema: {
    _id: String,
    name: String,
    fatherId: String,
    children: [],
  },
})

describe('Mongo idProperty', function () {
  before(async function () {
    const uri = await initMockMongo()
    await mongoose.connect(uri, { dbName: 'verifyMASTER' })
  })

  beforeEach(async function () {
    await clearMockMongo.call(this)
  })

  it('should merge', async function (this: Context) {
    this.timeout(5000)

    const props = {
      _id: 'test_1',
      name: 'Test',
    }

    const created = await Person.createOne(props).catch(e => console.error(e))
    expect(created).to.deep.include(props)

    const [found] = await Person.find({})

    expect(found).to.deep.include(props)
  })

  it('should handle string ts', async function () {
    const props = {
      _id: 'test_1',
      name: 'Test',
    }

    const created: BaseItem = await Person.createOne(props);
    expect(created.ts as string).to.be.not.null;

    const data = await Person.fetchAll({});

    expect(data[OFFSET_HEADER]).to.be.not.empty
  })
})
