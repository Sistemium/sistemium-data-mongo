import { assert, expect } from 'sistemium-data/test/chai';
import { mongoose } from 'sistemium-mongo/lib/mongoose';
import Model from 'sistemium-data/src/Model';
import MongoStoreAdapter from '../src/MongoStoreAdapter';
import { clearMockMongo, initMockMongo } from './mockMongo';

const storeAdapter = new MongoStoreAdapter({ mongoose, idProperty: '_id' });

class MongoModelId extends Model {
  constructor(config) {
    super(config);
  }
}

MongoModelId.useStoreAdapter(storeAdapter);

const Person = new MongoModelId({
  collection: 'PersonId',
  schema: {
    _id: String,
    name: String,
    fatherId: String,
    children: [],
  },
});


describe('Mongo idProperty', function () {

  before(async function() {
    const uri = await initMockMongo();
    await storeAdapter.connect(uri);
  });

  beforeEach(clearMockMongo);

  it('should merge', async function () {

    const props = {
      _id: 'test_1',
      name: 'Test'
    };

    const created = await Person.createOne(props)
      .catch(e => console.error(e));
    expect(created).to.deep.include(props);

    const [found] = await Person.find({})

    expect(found).to.deep.include(props);

  });

});