'use strict';

const AwsFacade = require('./aws-facade');
const _         = require('lodash');

describe('AWS Facade', () => {
  let awsFacade;
  let ecsClient;

  const service = (name, other) => {
    return _.assign({
      serviceName: name
    }, other || {});
  };

  const task = (arn, other) => {
    return _.assign({
      taskDefinitionArn: arn
    }, other || {});
  };

  beforeEach(() => {
    ecsClient = {
      describeServices: () => {
      },
      listTasks: () => {
      },
      describeTasks: () => {
      }
    };
    awsFacade = new AwsFacade(ecsClient);
  });

  describe('information retrieval from ECS', () => {
    describe('for services', () => {
      const mockEcsClient = (describeServicesResponse) => {
        spyOn(ecsClient, 'describeServices').and.callFake((x, cb) => {
          cb(null, describeServicesResponse);
        });
      };

      it('retrieves description of service', (done) => {
        const service1 = service('service-one');
        const service2 = service('service-two');

        mockEcsClient({services: [service1, service2]});

        awsFacade.getService('some cluster', 'service-one', (err, data) => {
          if (err) {
            return done.failed();
          }

          expect(data).toEqual(service1);
          done();
        });
      });
    });

    describe('for tasks', () => {
      const task1    = task('task-arn-1');
      const task2    = task('task-arn-2');
      const taskArns = ['task-arn-1', 'task-arn-2'];

      const mockEcsClient = (listTasksResponses, describeTasksResponses) => {
        let listTasksCall     = 0;
        let describeTasksCall = 0;

        spyOn(ecsClient, 'listTasks').and.callFake((params, cb) => {
          cb(null, listTasksResponses[listTasksCall++]);
        });
        spyOn(ecsClient, 'describeTasks').and.callFake((params, cb) => {
          cb(null, describeTasksResponses[describeTasksCall++]);
        });
      };

      it('retrieves description of cluster with few number of services', (done) => {
        mockEcsClient(
          [{taskArns: taskArns, nextToken: null}],
          [{tasks: [task1, task2]}]
        );

        awsFacade.getTasks('cluster', 'service', 'RUNNING', (err, data) => {
          if (err) {
            return done.failed();
          }

          expect(data).toEqual([task1, task2]);
          done();
        });
      });

      it('retrieves description of tasks with multiple calls', (done) => {
        mockEcsClient(
          [
            {taskArns: taskArns.slice(0, 1), nextToken: 1},
            {taskArns: taskArns.slice(1, 2), nextToken: null}
          ],
          [
            {tasks: [task1]},
            {tasks: [task2]}
          ]
        );

        awsFacade.getTasks('cluster', 'service', 'RUNNING', (err, data) => {
          if (err) {
            return done.failed();
          }

          expect(data).toEqual([task1, task2]);
          done();
        });
      });
    });
  });
});
