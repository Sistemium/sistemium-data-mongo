import { BaseItem } from 'sistemium-data';

export default () => {
  const now = new Date().getTime();
  return [
    {
      id: 'john-smith-id',
      name: 'John Smith',
      fatherId: 'fatherId1',
      'x-offset': now.toString(),
    },
    {
      id: 'samantha-jones-id',
      name: 'Samantha Jones',
      fatherId: 'fatherId2',
      'x-offset': (now + 1).toString(),
    },
  ] as [BaseItem, BaseItem];
}
