'use strict';

const _            = require('lodash');
const moment       = require('moment');
const Constants    = require('./constants');
const QueryMapping = {};

QueryMapping[Constants.DeploymentType.Current]  = {
  IndexName: 'Deployment',
  KeyConditionExpression: 'deployment = :deployment',
};
QueryMapping[Constants.DeploymentType.Previous] = {
  IndexName: 'PreviousDeployment',
  KeyConditionExpression: 'previous_deployment = :deployment',
};

module.exports = class DeploymentDao {
  /**
   * @param {Object} dynamoDocumentClient
   * @param {number} expiredThreshold
   */
  constructor(dynamoDocumentClient, expiredThreshold) {
    this.dynamoDocumentClient = dynamoDocumentClient;
    this.expiredThreshold     = expiredThreshold;
  }

  /**
   * @param {Object} item
   * @param {Object} values
   * @param {*} cb
   */
  update(item, values, cb) {
    const params = _.assign(
      this._createPrimaryParams(item),
      this._createExpressions(values)
    );

    this.dynamoDocumentClient.update(params, cb);
  }

  /**
   * @param {Object} item
   * @param {*} cb
   */
  delete(item, cb) {
    this.dynamoDocumentClient.delete(this._createPrimaryParams(item), cb);
  }

  /**
   * @param {string} deployment
   * @param {*} cb
   */
  findDeploymentType(deployment, cb) {
    const params = {
      ExpressionAttributeValues: {
        ':deployment': deployment
      }
    };

    const currentQuery = _.assign({}, params, QueryMapping[Constants.DeploymentType.Current]);
    this._query(currentQuery, (err, data) => {
      if (err) {
        return cb(err);
      }

      switch (data.Count) {
        case 0:
          // that is ok, we continue
          break;
        case 1:
          return cb(null, Constants.DeploymentType.Current, data.Items[0]);
          break;
        default:
          return cb(new Error(`Found ${data.Count} current deployments for ${deployment}`));
          break;
      }

      const prevQuery = _.assign({}, params, QueryMapping[Constants.DeploymentType.Previous]);
      this._query(prevQuery, (err, data) => {
        if (err) {
          return cb(err);
        }

        switch (data.Count) {
          case 0:
            return cb(null, Constants.DeploymentType.Empty);
          case 1:
            return cb(null, Constants.DeploymentType.Previous, data.Items[0]);
            break;
          default:
            return cb(new Error(`Found ${data.Count} previous deployments for ${deployment}`));
            break;
        }
      });
    });
  }

  /**
   * @param {*} cb
   */
  findExpired(cb) {
    const timestamp = moment().unix() - this.expiredThreshold;

    this._query({
      IndexName: 'State',
      KeyConditionExpression: '#S = :state AND last_updated_at < :lastUpdate',
      ExpressionAttributeNames: {
        '#S': 'state'
      },
      ExpressionAttributeValues: {
        ':state': Constants.State.Running,
        ':lastUpdate': timestamp
      }
    }, cb);
  }

  /**
   * @param {*} cb
   */
  findFinished(cb) {
    this._query({
      IndexName: 'State',
      KeyConditionExpression: '#S = :state',
      ExpressionAttributeNames: {
        '#S': 'state'
      },
      ExpressionAttributeValues: {
        ':state': Constants.State.Finished
      }
    }, cb);
  }

  /**
   * @param {Object} query
   * @param {*} cb
   * @private
   */
  _query(query, cb) {
    this.dynamoDocumentClient.query(query, cb);
  }

  /**
   * @param {Object} item
   * @return {{Key: {id: string}}}
   * @private
   */
  _createPrimaryParams(item) {
    return {
      Key: {id: item.id}
    };
  }

  /**
   * @param {Object} values
   * @return {{
   *    UpdateExpression: string,
   *    ExpressionAttributeNames: {},
   *    ExpressionAttributeValues: {}
   * }}
   * @private
   */
  _createExpressions(values) {
    const expressions = {
      UpdateExpression: [],
      ExpressionAttributeNames: {},
      ExpressionAttributeValues: {}
    };

    let i = 1;
    _.each(values, (v, k) => {
      const name = _.padStart(`${i++}`, 3, '0');

      expressions.UpdateExpression.push(`#${name} = :${name}`);
      expressions.ExpressionAttributeNames[`#${name}`]  = k;
      expressions.ExpressionAttributeValues[`:${name}`] = v;
    });

    expressions.UpdateExpression = `set ${expressions.UpdateExpression.join(', ')}`;

    return expressions;
  }
};
