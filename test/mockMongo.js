import { MongoMemoryServer } from 'mongodb-memory-server';
import { mongoose } from 'sistemium-mongo/lib/mongoose';

let mongoServer;

export async function initMockMongo() {
  mongoServer = mongoServer || await MongoMemoryServer.create();
  // console.log(mongoServer.getUri());
  return `${mongoServer.getUri().replace('mongodb://', '')}verifyMASTER`;
}

export async function clearMockMongo() {
  const collections = await mongoose.connection.db.collections();
  for (let collection of collections) {
    await collection.deleteMany({});
  }
}
