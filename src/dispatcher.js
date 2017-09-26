'use strict';

module.exports = class Dispatcher {
  /**
   * @param {DeploymentHandler} deploymentHandler
   */
  constructor(deploymentHandler) {
    this.deploymentHandler = deploymentHandler;
  }

  /**
   * @param {object} event
   * @param {Function} cb
   */
  dispatch(event, cb) {
    switch (event.source) {
      case 'tm.ecd':
        switch (event['detail-type']) {
          case 'ECD Service Deployment Started':
            this.deploymentHandler.start(event.detail, cb);
            break;
        }
        break;
      case 'aws.ecs':
        this.deploymentHandler.progress(event.detail, cb);
        break;
      case 'aws.events':
        this.deploymentHandler.stop(cb);
        break;
    }
  }
};
