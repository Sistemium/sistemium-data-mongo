import MongoStoreAdapter from './MongoStoreAdapter';

const PREFIX = '0-';
const MATCH_RE = /^0-(\d+)\|\|(.+)$/;
const DELIMITER = '||'

type BaseItem = Record<string, any>

export default class DateOffsetAdapter extends MongoStoreAdapter {

  protected offsetFromRecord(obj: BaseItem) {
    const { ts, [this.idProperty]: id } = obj;
    return `${PREFIX}${ts.getTime()}${DELIMITER}${id}`;
  }

  protected offsetToFilter(offset: string): BaseItem {
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

  protected offsetSort(): Record<string, 1> {
    return { ts: 1, [this.idProperty]: 1 };
  }

  protected $currentDate() {
    return { ts: { $type: 'date' } };
  }

}

function offsetToParams(offset: string) {
  const [, ts, id] = offset.match(MATCH_RE) || [];
  return {
    ts: new Date(ts ? parseInt(ts, 10) : '0000-01-01'),
    id: id || '',
  };
}
