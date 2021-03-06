import { assert, expect } from 'sistemium-data/test/chai';
import { mongoose } from 'sistemium-mongo/lib/mongoose';
import Model, { OFFSET_HEADER, SORT_HEADER, FULL_RESPONSE_OPTION } from 'sistemium-data/src/Model';
import MongoStoreAdapter from '../src/MongoStoreAdapter';
import { MockMongoose } from 'mock-mongoose';
import personData from 'sistemium-data/test/personData';
import CommonFieldsPlugin from 'sistemium-data/src/plugins/CommonFieldsPlugin';
import lo from 'lodash';

const people = personData();
const mockMongoose = new MockMongoose(mongoose);
const storeAdapter = new MongoStoreAdapter({ mongoose });

class MongoModel extends Model {
}

if (!MongoModel.useStoreAdapter) {
  Object.assign(MongoModel, Model);
}

MongoModel
  .useStoreAdapter(storeAdapter)
  .plugin(new CommonFieldsPlugin());

const Person = new MongoModel({
  collection: 'Person',
  schema: {
    id: String,
    name: String,
    fatherId: String,
  },
});

describe('Mongo Model', function () {

  before(async function () {
    await mockMongoose.prepareStorage();
    await storeAdapter.connect('mongo.sistemium.net/TestingDB');
  });

  beforeEach(async function () {
    await mockMongoose.helper.reset();
  });

  it('should respond 204', async function () {

    const { status, data } = await Person.find({}, { [FULL_RESPONSE_OPTION]: true });

    expect(status).equals(204);
    expect(data).to.eql([]);

  });

  it('should store data', async function () {

    const props = people[0];

    const created = await Person.createOne(props);
    // console.log('created', created);
    expect(created).to.deep.include(props);

    await Person.createOne(people[1]);

    const found = await Person.findByID(props.id);
    // console.log('found', found);
    expect(found, 'found object is not equal to created').to.eql(created);

    const foundArray = await Person.find({ id: props.id });
    expect(foundArray).to.eql([created]);

    const updated = await Person.createOne({ ...props, fatherId: null });
    expect(updated.fatherId).equals(null);

  });

  it('should merge and delete data', async function () {

    const ids = await Person.merge(people);
    // console.log('ids', ids);
    expect(ids).to.be.eql(people.map(({ id }) => id));

    await Person.destroy(ids[0]);
    await Person.deleteOne({ id: ids[1] });
    const deleted = await Person.find({ id: { $in: lo.take(ids, 2) } });
    expect(deleted).to.eql([]);

  });

  it('should fetch with offset', async function () {

    await Person.merge(people);
    const data = await Person.fetchAll();
    const { [OFFSET_HEADER]: offset } = data;
    // console.log('data', data);

    expect(offset).to.match(/^2-\d+$/);

    const emptyArray = await Person.fetchAll({}, { headers: { [OFFSET_HEADER]: offset } });
    expect(emptyArray).to.eql([]);

  });

  it('should sort', async function () {

    await Person.merge(people);

    const nameDesc = '-name,id';
    const nameAsc = 'name,id';

    const dataDesc = await Person.find({}, { headers: { [SORT_HEADER]: nameDesc } });
    assert(dataDesc[0].name > dataDesc[1].name, 'Should be descending order');

    const dataAsc = await Person.find({}, { headers: { [SORT_HEADER]: nameAsc } });
    assert(dataAsc[0].name < dataAsc[1].name, 'Should be ascending order');

  });

  it('should apply defaults on create', async function () {

    const person = await Person.create({ name: 'Name Without ID' });
    assert(person.id, 'Must be not null id');

  });

  it('should apply defaults on merge', async function () {

    const [personId] = await Person.merge([{ name: 'Name Without ID' }]);
    assert(personId, 'Must be not null id');

  });


  after(async function () {
    await storeAdapter.disconnect();
  });

});
