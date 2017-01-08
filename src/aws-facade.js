'use strict';

const async = require('neo-async');
const _     = require('lodash');

/**
 * Enables easier retrieval of AWS information.
 *
 * @type {AwsFacade}
 */
module.exports = class AwsFacade {
  /**
   * @param {Object} ecsClient
   */
  constructor(ecsClient) {
    this.ecsClient = ecsClient;
  }

  /**
   * @param {string} cluster
   * @param {string} service
   * @param {*} cb
   */
  getService(cluster, service, cb) {
    async.waterfall([
      (cb) => this.ecsClient.describeServices({cluster: cluster, services: [service]}, cb),
      (response, cb) => {
        cb(null, _.find(response.services, {serviceName: service}));
      }
    ], cb);
  }

  /**
   * @param {string} cluster
   * @param {string} service
   * @param {string} status
   * @param {*} cb
   */
  getTasks(cluster, service, status, cb) {
    let token = null;
    let tasks = [];

    async.doUntil(
      (cb) => async.seq(
        (t, cb) => this.ecsClient.listTasks(
          {cluster: cluster, serviceName: service, desiredStatus: status, nextToken: t},
          cb),
        (response, cb) => {
          if (0 === response.taskArns.length) {
            return cb(null, [response.nextToken, []]);
          }

          this.ecsClient.describeTasks({
              cluster: cluster,
              tasks: response.taskArns
            }, (err, data) => cb(err, [response.nextToken, data.tasks])
          );
        }
      )(token, cb),
      (data) => {
        tasks = tasks.concat(data[1]);
        return !(token = data[0]);
      },
      (err) => {
        cb(err, tasks);
      }
    );
  }
};
