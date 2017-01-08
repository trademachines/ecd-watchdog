'use strict';

const async = require('neo-async');
const _     = require('lodash');

module.exports = class EventDispatcher {
  /**
   * @param {DeploymentDao} deploymentDao
   * @param {AWS.CloudWatchEvents} cloudwatchEventsClient
   */
  constructor(deploymentDao, cloudwatchEventsClient) {
    this.deploymentDao          = deploymentDao;
    this.cloudwatchEventsClient = cloudwatchEventsClient;
  }

  /**
   * @param {object} item
   * @param {Function} cb
   */
  succeeded(item, cb) {
    this._dispatch(
      item,
      'ECD Deployment Succeeded',
      _.omit(item, 'id'),
      cb
    );
  }

  /**
   * @param {object} item
   * @param {object} detail
   * @param {Function} cb
   */
  failed(item, detail, cb) {
    this._dispatch(
      item,
      'ECD Deployment Failed',
      _.assign(_.omit(item, 'id'), {ecsDetail: detail}),
      cb
    );
  }

  /**
   * @param {object} item
   * @param {Function} cb
   */
  hanging(item, cb) {
    this._dispatch(
      item,
      'ECD Deployment Hanging',
      _.pick(item, 'cluster', 'service', 'deployment', 'last_updated_at'),
      cb
    );
  }

  /**
   * @param {object} item
   * @param {string} type
   * @param {object} details
   * @param {Function} cb
   * @private
   */
  _dispatch(item, type, details, cb) {
    const entry = {
      Source: 'tm.ecd.watchdog',
      DetailType: type,
      Detail: JSON.stringify(details)
    };

    async.parallel([
      (cb) => this.deploymentDao.delete(item, cb),
      (cb) => this.cloudwatchEventsClient.putEvents({Entries: [entry]}, cb)
    ], cb);
  }
};
