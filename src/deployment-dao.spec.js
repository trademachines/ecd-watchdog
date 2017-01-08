'use strict';

const Constants     = require('./constants');
const DeploymentDao = require('./deployment-dao');

describe('Item Data Access', () => {
  let dao;
  let dynamoClient;

  beforeEach(() => {
    dynamoClient = {
      query: () => {
      }
    };
    dao          = new DeploymentDao(dynamoClient, 12345);
  });

  describe('finding deployments', () => {
    const mockQueries = (queries) => {
      let i = 0;
      spyOn(dynamoClient, 'query').and.callFake((x, cb) => {
        const current = i++;
        const val     = !!queries[current] ? queries[current] : null;

        if (val instanceof Error) {
          cb(val);
        } else {
          cb(null, val);
        }
      });
    };

    it('returns errors for current deployment', () => {
      const error = new Error('random error');
      mockQueries([error]);

      dao.findDeploymentType('123456', (err) => {
        expect(err).toBe(error);
      });
    });

    it('returns exactly 1 item for current deployment', () => {
      const item = {
        id: 1
      };
      mockQueries([{Count: 1, Items: [item]}]);

      dao.findDeploymentType('123456', (err, type, result) => {
        expect(type).toBe(Constants.DeploymentType.Current);
        expect(result).toBe(item);
      });
    });

    it('complains if it finds more than 1 item for current deployment', () => {
      mockQueries([{Count: 2}]);

      dao.findDeploymentType('123456', (err) => {
        expect(err).toEqual(jasmine.any(Error));
        expect(err.message).toEqual('Found 2 current deployments for 123456');
      });
    });

    it('returns error for previous deployment', () => {
      const error = new Error('random error');
      mockQueries([{Count: 0}, error]);

      dao.findDeploymentType('123456', (err) => {
        expect(err).toBe(error);
      });
    });

    it('complains if it does not find 1 item for previous deployment', () => {
      mockQueries([{Count: 0}, {Count: 2}]);

      dao.findDeploymentType('123456', (err) => {
        expect(err).toEqual(jasmine.any(Error));
        expect(err.message).toEqual('Found 2 previous deployments for 123456');
      });
    });

    it('returns unknown if it finds 0 previous deployments', () => {
      mockQueries([{Count: 0}, {Count: 0}]);

      dao.findDeploymentType('123456', (err, type) => {
        expect(type).toEqual(Constants.DeploymentType.Empty);
      });
    });

    it('returns exactly 1 item for previous deployment', () => {
      const item = {
        id: 1
      };
      mockQueries([{Count: 0}, {Count: 1, Items: [item]}]);

      dao.findDeploymentType('123456', (err, type, result) => {
        expect(type).toBe(Constants.DeploymentType.Previous);
        expect(result).toBe(item);
      });
    });

    it('queries state index for expired deployments', () => {
      mockQueries([{}]);

      dao.findExpired(() => {
        expect(dynamoClient.query).toHaveBeenCalledWith(jasmine.objectContaining({
          IndexName: 'State',
          ExpressionAttributeValues: {
            ':state': Constants.State.Running,
            ':lastUpdate': jasmine.any(Number)
          }
        }), jasmine.anything());
      });
    });

    it('queries state index for stopped deployments', () => {
      mockQueries([{}]);

      dao.findFinished(() => {
        expect(dynamoClient.query).toHaveBeenCalledWith(jasmine.objectContaining({
          IndexName: 'State',
          ExpressionAttributeValues: {
            ':state': Constants.State.Finished
          }
        }), jasmine.anything());
      });
    });
  });

  it('creates disguised expressions', () => {
    const ex = dao._createExpressions({foo: 'bar', last_updated: 123456});

    expect(ex.UpdateExpression).toEqual('set #001 = :001, #002 = :002');
    expect(ex.ExpressionAttributeNames).toEqual({'#001': 'foo', '#002': 'last_updated'});
    expect(ex.ExpressionAttributeValues).toEqual({':001': 'bar', ':002': 123456});
  });
});
