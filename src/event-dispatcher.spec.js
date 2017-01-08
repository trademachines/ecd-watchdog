'use strict';

const EventDispatcher = require('./event-dispatcher');

describe('Event dispatching', () => {
  let deploymentDao;
  let cloudwatchEventsClient;
  let eventDispatcher;

  beforeEach(() => {
    deploymentDao          = {
      delete: () => {
      }
    };
    cloudwatchEventsClient = {
      putEvents: () => {
      }
    };
    eventDispatcher        = new EventDispatcher(deploymentDao, cloudwatchEventsClient);
    spyOn(deploymentDao, 'delete').and.callFake((x, cb) => cb());
    spyOn(cloudwatchEventsClient, 'putEvents').and.callFake((x, cb) => cb());
  });

  it('dispatches event for successful deployment', () => {
    const item = {id: 1, foo: 'bar', bar: 'foo'};

    eventDispatcher.succeeded(item, () => {
      expect(deploymentDao.delete).toHaveBeenCalledWith(item, jasmine.anything());
      expect(cloudwatchEventsClient.putEvents)
        .toHaveBeenCalledWith(
          {
            Entries: [jasmine.objectContaining({
              Source: jasmine.any(String),
              DetailType: jasmine.any(String),
              Detail: JSON.stringify({foo: 'bar', bar: 'foo'})
            })]
          },
          jasmine.anything()
        );
    });
  });

  it('dispatches event for failed deployment', () => {
    const item = {id: 1, foo: 'bar', bar: 'foo'};

    eventDispatcher.failed(item, {one: 'two'}, () => {
      expect(deploymentDao.delete).toHaveBeenCalledWith(item, jasmine.anything());
      expect(cloudwatchEventsClient.putEvents)
        .toHaveBeenCalledWith(
          {
            Entries: [jasmine.objectContaining({
              Source: jasmine.any(String),
              DetailType: jasmine.any(String),
              Detail: JSON.stringify({foo: 'bar', bar: 'foo', ecsDetail: {one: 'two'}})
            })]
          },
          jasmine.anything()
        );
    });
  });

  it('dispatches event for hanging deployment', () => {
    const item = {id: 1, cluster: 'foo', service: 'bar'};

    eventDispatcher.hanging(item, () => {
      expect(deploymentDao.delete).toHaveBeenCalledWith(item, jasmine.anything());
      expect(cloudwatchEventsClient.putEvents)
        .toHaveBeenCalledWith(
          {
            Entries: [jasmine.objectContaining({
              Source: jasmine.any(String),
              DetailType: jasmine.any(String),
              Detail: JSON.stringify({cluster: 'foo', service: 'bar'})
            })]
          },
          jasmine.anything()
        );
    });
  });
});
