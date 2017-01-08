'use strict';

const AWS       = require('aws-sdk');
const async     = require('neo-async');
const moment    = require('moment');
const _         = require('lodash');
const Constants = require('./src/constants');

const docClient        = new AWS.DynamoDB.DocumentClient({params: {TableName: Constants.TableName}});
const cloudwatchEvents = new AWS.CloudWatchEvents();
const ecs              = new AWS.ECS();

const DeploymentDao     = require('./src/deployment-dao');
const AwsFacade         = require('./src/aws-facade');
const Dispatcher        = require('./src/dispatcher');
const EventDispatcher   = require('./src/event-dispatcher');
const DeploymentHandler = require('./src/deployment-handler');

const deploymentDao     = new DeploymentDao(docClient, Constants.ExpiredThresholdInSeconds);
const awsFacade         = new AwsFacade(ecs);
const eventDispatcher   = new EventDispatcher(deploymentDao, cloudwatchEvents);
const deploymentHandler = new DeploymentHandler(awsFacade, deploymentDao, eventDispatcher);
const dispatcher        = new Dispatcher(deploymentHandler);

exports.handle = (event, context, callback) => {
  dispatcher.dispatch(event, callback);
};
