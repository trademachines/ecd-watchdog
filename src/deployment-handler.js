'use strict';

const moment    = require('moment');
const async     = require('neo-async');
const _         = require('lodash');
const Constants = require('./constants');

module.exports = class DeploymentHandler {
  /**
   * @param {AwsFacade} awsFacade
   * @param {DeploymentDao} deploymentDao
   * @param {EventDispatcher} eventDispatcher
   */
  constructor(awsFacade, deploymentDao, eventDispatcher) {
    this.awsFacade       = awsFacade;
    this.deploymentDao   = deploymentDao;
    this.eventDispatcher = eventDispatcher;
  }

  /**
   * @param {Object} event
   * @param {*} cb
   */
  start(event, cb) {
    this.awsFacade.getService(event.cluster, event.service, (err, service) => {
      if (err) {
        return cb(err);
      }

      this._handleStart(event, service, cb);
    });
  }

  /**
   * @param {Object} event
   * @param {*} cb
   */
  progress(event, cb) {
    const deployment     = event.startedBy;
    const inDesiredState = event.desiredStatus === event.lastStatus;
    const isStopped      = 'STOPPED' === event.lastStatus;
    const isRunning      = 'RUNNING' === event.lastStatus;

    if (inDesiredState || isStopped) {
      this.deploymentDao.findDeploymentType(deployment, (err, type, item) => {
        if (err) {
          return cb(err);
        }

        switch (type) {
          case Constants.DeploymentType.Empty:
            cb();
            break;
          case Constants.DeploymentType.Current:
            this._handleCurrentDeployment(isStopped, isRunning, item, event, cb);
            break;
          case Constants.DeploymentType.Previous:
            this._handlePreviousDeployment(isStopped, item, cb);
            break;
        }
      });
    } else {
      cb();
    }
  }

  /**
   * @param {*} cb
   */
  stop(cb) {
    async.parallel([
      (cb) => this._handleFinishedDeployments(cb),
      (cb) => this._handleExpiredDeployments(cb)
    ], cb);
  }

  /**
   * @param {*} cb
   * @private
   */
  _handleFinishedDeployments(cb) {
    async.waterfall([
      (cb) => this.deploymentDao.findFinished(cb),
      (finished, cb) => async.eachLimit(
        finished.Items, 2,
        _.bind(this._processFinishedDeployment, this), cb
      )
    ], cb);
  }

  /**
   * @param {*} cb
   * @private
   */
  _handleExpiredDeployments(cb) {
    async.waterfall([
      (cb) => this.deploymentDao.findExpired(cb),
      (expired, cb) => async.eachLimit(
        expired.Items, 2,
        _.bind(this._processExpiredDeployment, this), cb
      )
    ], cb);
  }

  /**
   * @param {Object} event
   * @param {Object} service
   * @param {*} cb
   * @private
   */
  _handleStart(event, service, cb) {
    const now  = moment();
    const id   = `${event.cluster},${event.service}`;
    const item = {id: id};
    let values = {
      cluster: event.cluster,
      service: event.service,
      last_updated_at: now.unix()
    };

    if (0 === service.desiredCount) {
      this._finishDeployment(_.assign(item, values), Constants.FinishedReason.Succeeded, null, cb);
    } else {
      const deployments   = service.deployments;
      const newDeployment = _.find(deployments, ['status', 'PRIMARY']);
      const oldDeployment = _.find(deployments, ['status', 'ACTIVE']);

      if (newDeployment && oldDeployment) {
        values = _.assign(values, {
          deployment: newDeployment.id,
          previous_deployment: oldDeployment.id,
          state: Constants.State.Running
        });

        this.deploymentDao.update(item, values, cb);
      } else {
        cb(new Error(`Cant find old or new deployment in ${JSON.stringify(deployments)}`));
      }
    }
  }

  /**
   * @param {boolean} isStopped
   * @param {boolean} isRunning
   * @param {Object} item
   * @param {Object} event
   * @param {*} cb
   * @private
   */
  _handleCurrentDeployment(isStopped, isRunning, item, event, cb) {
    switch (true) {
      case isStopped:
        this._finishDeployment(item, Constants.FinishedReason.Failed, event.detail, cb);
        break;
      case isRunning:
        this._continueDeployment(item, cb);
        break;
    }
  }

  /**
   * @param {boolean} isStopped
   * @param {Object} item
   * @param {*} cb
   * @private
   */
  _handlePreviousDeployment(isStopped, item, cb) {
    switch (true) {
      case isStopped:
        this._checkFinishedDeployment(item, cb);
        break;
    }
  }

  /**
   * @param {Object} item
   * @param {*} cb
   * @private
   */
  _checkFinishedDeployment(item, cb) {
    this.awsFacade.getTasks(item.cluster, item.service, 'RUNNING', (err, tasks) => {
      const startedBy            = _.groupBy(tasks, 'startedBy');
      const differentDeployments = _.keys(startedBy).length;

      switch (differentDeployments) {
        case 1:
          const deployment = _.head(_.keys(startedBy));

          if (deployment === item.deployment) {
            this._finishDeployment(item, Constants.FinishedReason.Succeeded, null, cb);
          }
          break;
        default:
          this._continueDeployment(item, cb);
      }
    });
  }

  /**
   * @param {Object} item
   * @param {string} reason
   * @param {Object} detail
   * @param {*} cb
   * @private
   */
  _finishDeployment(item, reason, detail, cb) {
    const values = _.assign(
      _.omit(item, 'id'),
      {
        state: Constants.State.Finished,
        finished_reason: reason,
        finished_detail: detail || {}
      }
    );
    this.deploymentDao.update(item, values, cb);
  }

  /**
   * @param {Object} item
   * @param {*} cb
   * @private
   */
  _continueDeployment(item, cb) {
    this.deploymentDao.update(item, {last_updated_at: moment().unix()}, cb);
  }

  /**
   * @param {Object} item
   * @param {*} cb
   * @private
   */
  _processFinishedDeployment(item, cb) {
    const cleanItem = _.pick(item, 'id', 'cluster', 'service', 'deployment');

    switch (item.finished_reason) {
      case Constants.FinishedReason.Succeeded:
        this.eventDispatcher.succeeded(cleanItem, cb);
        break;
      case Constants.FinishedReason.Failed:
        this.eventDispatcher.failed(cleanItem, item.finished_detail, cb);
        break;
      default:
        cb(new Error(`Can not handle stopped reason ${item.finished_reason}`));
    }
  }

  /**
   * @param {Object} item
   * @param {*} cb
   * @private
   */
  _processExpiredDeployment(item, cb) {
    item.last_updated_at = moment.unix(item.last_updated_at).format();

    this.eventDispatcher.hanging(item, cb);
  }
};
