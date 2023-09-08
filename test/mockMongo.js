import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { mongoose } from 'sistemium-mongo/lib/mongoose';

let mongoServer;

export async function initMockMongo() {
  mongoServer = mongoServer || await MongoMemoryReplSet.create({ replSet: { count: 2 } });
  return mongoServer.getUri();
}

export async function clearMockMongo() {
  this.timeout(5000);
  const collections = await mongoose.connection.db.collections();
  for (let collection of collections) {
    await collection.deleteMany({});
  }
}
