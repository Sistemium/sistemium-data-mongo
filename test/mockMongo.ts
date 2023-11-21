import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { mongoose } from 'sistemium-mongo/lib/mongoose';
import { Connection } from 'mongoose';
import { Context } from 'mocha';

let mongoServer: MongoMemoryReplSet;

export async function initMockMongo() {
  mongoServer = mongoServer || await MongoMemoryReplSet.create({ replSet: { count: 2 } });
  return mongoServer.getUri();
}

export async function clearMockMongo(this: Context) {
  this.timeout(5000);
  const { connection } = mongoose;
  const collections = await (connection as Connection).db.collections();
  for (let collection of collections) {
    await collection.deleteMany({});
  }
}
