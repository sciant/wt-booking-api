/* eslint-env mocha */
const { assert } = require('chai');
const sinon = require('sinon');

const { WTAdapter, InvalidUpdateError, RestrictionsViolatedError } = require('../../src/services/adapter');

function _getAdapter () {
  return new WTAdapter({
    hotelId: 'hotelId',
    readApiUrl: 'htttp://readApiUrl',
    writeApiUrl: 'http://writeApiUrl',
    writeApiAccessKey: 'writeApiAccessKey',
    writeApiWalletPassword: 'writeApiWalletPassword',
  });
}

describe('services - adapter', function () {
  describe('WTAdapter._applyUpdate', () => {
    const wtAdapter = _getAdapter();
    let availability;

    beforeEach(() => {
      availability = {
        roomType1: [
          { date: '2019-01-01', quantity: 10 },
          { date: '2019-01-02', quantity: 10 },
        ],
        roomType2: [
          { date: '2019-01-01', quantity: 5 },
          { date: '2019-01-02', quantity: 5 },
        ],
      };
    });

    it('should apply the requested update', async () => {
      wtAdapter._applyUpdate(availability, ['roomType1', 'roomType2', 'roomType2'],
        '2019-01-01', '2019-01-03');
      assert.deepEqual(availability, {
        roomType1: [
          { date: '2019-01-01', quantity: 9 },
          { date: '2019-01-02', quantity: 9 },
        ],
        roomType2: [
          { date: '2019-01-01', quantity: 3 },
          { date: '2019-01-02', quantity: 3 },
        ],
      });
    });

    it('should throw InvalidUpdateError upon unknown roomTypeId', async () => {
      assert.throws(() => {
        wtAdapter._applyUpdate(availability, ['roomTypeX'], '2019-01-01', '2019-01-02');
      }, InvalidUpdateError);
    });

    it('should throw InvalidUpdateError upon unknown date', async () => {
      assert.throws(() => {
        wtAdapter._applyUpdate(availability, ['roomType1'], '2021-01-01', '2021-01-02');
      }, InvalidUpdateError);
    });

    it('should throw InvalidUpdateError upon overbooking', async () => {
      assert.throws(() => {
        wtAdapter._applyUpdate(availability, Array(100).fill('roomType1'), '2019-01-01', '2019-01-02');
      }, InvalidUpdateError);
    });
  });

  describe('WTAdapter._checkRestrictions', () => {
    const wtAdapter = _getAdapter(),
      availability = {
        roomType1: [
          { date: '2019-01-01', quantity: 10 },
          { date: '2019-01-02', quantity: 10, restrictions: { noArrival: true } },
          { date: '2019-01-03', quantity: 10 },
          { date: '2019-01-04', quantity: 10, restrictions: { noDeparture: true } },
        ],
      };

    it('should throw when the noArrival restriction is violated', async () => {
      assert.throws(() => {
        wtAdapter._checkRestrictions(availability, ['roomType1'], '2019-01-02', '2019-01-03');
      }, RestrictionsViolatedError);
    });

    it('should throw when the noDeparture restriction is violated', async () => {
      assert.throws(() => {
        wtAdapter._checkRestrictions(availability, ['roomType1'], '2019-01-01', '2019-01-04');
      }, RestrictionsViolatedError);
    });

    it('should not throw if no restrictions are violated', async () => {
      wtAdapter._checkRestrictions(availability, ['roomType1'], '2019-01-01', '2019-01-03');
    });
  });

  describe('WTAdapter.updateAvailability', () => {
    let wtAdapter;

    beforeEach(async () => {
      wtAdapter = _getAdapter();
      wtAdapter.__availability = { count: 10 };
      sinon.stub(wtAdapter, '_getAvailability').callsFake(() => {
        return Promise.resolve(wtAdapter.__availability);
      });
      sinon.stub(wtAdapter, '_applyUpdate').callsFake((orig, update) => {
        if (update === 'fail') {
          throw new Error('Failed update');
        }
        orig.count -= 1;
      });
      sinon.stub(wtAdapter, '_setAvailability').callsFake((availability) => {
        wtAdapter.__availability = availability;
        return Promise.resolve();
      });
    });

    it('should update the availability', async () => {
      assert.deepEqual(wtAdapter.__availability, { count: 10 });
      await wtAdapter.updateAvailability([], '2019-01-01', '2019-01-02');
      assert.deepEqual(wtAdapter.__availability, { count: 9 });
    });

    it('should serialize updates', async () => {
      await Promise.all([
        wtAdapter.updateAvailability([], '2019-01-01', '2019-01-02'),
        wtAdapter.updateAvailability([], '2019-01-01', '2019-01-02'),
        wtAdapter.updateAvailability([], '2019-01-01', '2019-01-02'),
        wtAdapter.updateAvailability([], '2019-01-01', '2019-01-02'),
      ]);
      assert.deepEqual(wtAdapter.__availability, { count: 6 });
    });

    it('should handle single failures', async () => {
      await Promise.all([
        wtAdapter.updateAvailability([], '2019-01-01', '2019-01-02'),
        wtAdapter.updateAvailability('fail', '2019-01-01', '2019-01-02').catch(() => {}),
        wtAdapter.updateAvailability([], '2019-01-01', '2019-01-02'),
        wtAdapter.updateAvailability([], '2019-01-01', '2019-01-02'),
      ]);
      assert.deepEqual(wtAdapter.__availability, { count: 7 });
    });
  });
});
