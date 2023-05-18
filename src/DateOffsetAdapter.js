import MongoStoreAdapter from './MongoStoreAdapter';

const PREFIX = '0-';
const MATCH_RE = /^0-(\d+)\|\|(.+)$/;
const DELIMITER = '||'

export default class DateOffsetAdapter extends MongoStoreAdapter {

  offsetFromRecord(obj) {
    const { ts, [this.idProperty]: id } = obj;
    return `${PREFIX}${ts.getTime()}${DELIMITER}${id}`;
  }

  offsetToFilter(offset) {
    const { ts, id } = offsetToParams(offset);
    return {
      $or: [
        { ts: { $gt: ts } },
        {
          $and: [
            { ts },
            { [this.idProperty]: { $gt: id } },
          ]
        },
      ],
    };
  }

  offsetSort() {
    return { ts: 1, [this.idProperty]: 1 };
  }

  $currentDate() {
    return { ts: { $type: 'date' } };
  }

}

function offsetToParams(offset) {
  const [, ts, id] = offset.match(MATCH_RE) || [];
  return {
    ts: new Date(ts ? parseInt(ts, 10) : '0000-01-01'),
    id: id || '',
  };
}
