'use strict';

const _                 = require('lodash');
const DeploymentHandler = require('./deployment-handler');
const Constants         = require('./constants');

describe('', () => {
  let awsFacade;
  let deploymentDao;
  let eventDispatcher;
  let deploymentHandler;

  beforeEach(() => {
    awsFacade         = {
      getService: () => {
      },
      getTasks: () => {
      }
    };
    deploymentDao     = {
      update: () => {
      },
      findDeploymentType: () => {
      },
      findFinished: () => {
      },
      findExpired: () => {
      }
    };
    eventDispatcher   = {
      succeeded: () => {
      },
      failed: () => {
      },
      hanging: () => {
      },
    };
    deploymentHandler = new DeploymentHandler(awsFacade, deploymentDao, eventDispatcher);

    spyOn(deploymentDao, 'update').and.callFake((i, v, cb) => cb());
  });

  describe('starting a deployment', () => {
    let service;
    const completeService = {
      deployments: [
        {status: 'PRIMARY', id: '123456'},
        {status: 'ACTIVE', id: 'abcdef'},
      ]
    };

    beforeEach(() => {
      service = {};
      spyOn(awsFacade, 'getService').and.callFake((c, s, cb) => cb(null, service));
    });

    it('fails if deployment info is missing for service', () => {
      deploymentHandler.start({}, (err) => {
        expect(err).toEqual(jasmine.any(Error));
        expect(err.message).toEqual(jasmine.stringMatching(/Cant find old or new deployment/));
      });
    });

    it('writes new item for new deploymets', () => {
      service = completeService;

      deploymentHandler.start({cluster: 'foo', service: 'bar'}, () => {
        expect(deploymentDao.update).toHaveBeenCalledWith(
          {id: jasmine.any(String)},
          jasmine.objectContaining({
            state: Constants.State.Running,
            cluster: 'foo',
            service: 'bar'
          }),
          jasmine.anything()
        );
      });
    });

    it('uses cluster and service for composing identifier', () => {
      service = completeService;

      deploymentHandler.start({cluster: 'foo', service: 'bar'}, () => {
        expect(deploymentDao.update).toHaveBeenCalledWith(
          {id: 'foo,bar'}, jasmine.anything(), jasmine.anything()
        );
      });
    });

    it('stops deployment immediately if no tasks are desired', () => {
      service = {desiredCount: 0};

      deploymentHandler.start({cluster: 'foo', service: 'bar'}, () => {
        expect(deploymentDao.update).toHaveBeenCalledWith(
          jasmine.objectContaining({
            id: jasmine.any(String),
            cluster: 'foo',
            service: 'bar'
          }),
          jasmine.objectContaining({
            state: Constants.State.Finished,
            finished_reason: Constants.FinishedReason.Succeeded
          }),
          jasmine.anything()
        );
      });
    });
  });

  describe('progressing a deployment', () => {
    let deploymentType;
    let deploymentItem;

    beforeEach(() => {
      deploymentType = null;
      deploymentItem = {};

      spyOn(deploymentDao, 'findDeploymentType')
        .and.callFake((d, cb) => cb(null, deploymentType, deploymentItem));
    });

    describe('events for tasks from current deployment', () => {
      it('fails deployment if task was stopped', () => {
        const event    = {lastStatus: 'STOPPED'};
        deploymentType = Constants.DeploymentType.Current;

        deploymentHandler.progress(event, () => {
          expect(deploymentDao.update).toHaveBeenCalledWith(
            jasmine.anything(),
            jasmine.objectContaining({
              state: Constants.State.Finished,
              finished_reason: Constants.FinishedReason.Failed
            }),
            jasmine.anything()
          );
        });
      });

      it('updates deployment if task started', () => {
        const event    = {desiredStatus: 'RUNNING', lastStatus: 'RUNNING'};
        deploymentType = Constants.DeploymentType.Current;

        deploymentHandler.progress(event, () => {
          expect(deploymentDao.update).toHaveBeenCalledWith(
            jasmine.anything(),
            jasmine.objectContaining({
              last_updated_at: jasmine.any(Number)
            }),
            jasmine.anything()
          );
        });
      });
    });

    describe('events for tasks from previous deployment', () => {
      let tasks;

      beforeEach(() => {
        tasks = [];
        spyOn(awsFacade, 'getTasks').and.callFake((c, s, st, cb) => cb(null, tasks));
      });

      it('updates deployment if tasks from multiple deployment are still running', () => {
        const event    = {lastStatus: 'STOPPED'};
        deploymentType = Constants.DeploymentType.Previous;
        tasks          = [
          {startedBy: 'new'},
          {startedBy: 'old'},
        ];

        deploymentHandler.progress(event, () => {
          expect(deploymentDao.update).toHaveBeenCalledWith(
            jasmine.anything(),
            jasmine.objectContaining({
              last_updated_at: jasmine.any(Number)
            }),
            jasmine.anything()
          );
        });
      });

      it('finishes deployment if only tasks from current deployment are running', () => {
        const event    = {lastStatus: 'STOPPED'};
        deploymentType = Constants.DeploymentType.Previous;
        deploymentItem = {
          deployment: 'new'
        };
        tasks          = [
          {startedBy: 'new'}
        ];

        deploymentHandler.progress(event, () => {
          expect(deploymentDao.update).toHaveBeenCalledWith(
            jasmine.anything(),
            jasmine.objectContaining({
              state: Constants.State.Finished,
              finished_reason: Constants.FinishedReason.Succeeded
            }),
            jasmine.anything()
          );
        });
      });
    });
  });

  describe('stopping a deployment', () => {
    let finishedItems;
    let expiredItems;

    beforeEach(() => {
      spyOn(deploymentDao, 'findFinished').and.callFake((cb) => cb(null, {Items: finishedItems}));
      spyOn(deploymentDao, 'findExpired').and.callFake((cb) => cb(null, {Items: expiredItems}));
      spyOn(eventDispatcher, 'succeeded').and.callFake((i, cb) => cb());
      spyOn(eventDispatcher, 'failed').and.callFake((i, d, cb) => cb());
      spyOn(eventDispatcher, 'hanging').and.callFake((i, cb) => cb());
    });

    it('informs about succeeded deployments', () => {
      const item    = {cluster: 'foo', service: 'bar'};
      finishedItems = [_.assign({finished_reason: Constants.FinishedReason.Succeeded}, item)];

      deploymentHandler.stop(() => {
        expect(eventDispatcher.succeeded)
          .toHaveBeenCalledWith(jasmine.objectContaining(item), jasmine.anything());
      });
    });

    it('informs about failed deployments', () => {
      const detail  = {};
      const item    = {cluster: 'foo', service: 'bar'};
      finishedItems = [
        _.assign({
          finished_reason: Constants.FinishedReason.Failed,
          finished_detail: detail
        }, item)
      ];

      deploymentHandler.stop(() => {
        expect(eventDispatcher.failed)
          .toHaveBeenCalledWith(jasmine.objectContaining(item), detail, jasmine.anything());
      });
    });

    it('informs about hanging deployments', () => {
      const item    = {cluster: 'foo', service: 'bar', last_updated_at: jasmine.any(String)};
      expiredItems = [item];

      deploymentHandler.stop(() => {
        expect(eventDispatcher.hanging)
          .toHaveBeenCalledWith(jasmine.objectContaining(item), jasmine.anything());
      });
    });
  });
});
