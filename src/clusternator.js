'use strict';
/**
 * This file is in all probability *deprecated* but that needs to be confirmed
 * @deprecated
 * @module clusternator
 */

const q = require('q');
const R = require('ramda');
const AWS = require('aws-sdk');

var util = require('./util');
var EC2Manager = require('./aws/ec2Manager');
var ClusterManager = require('./aws/clusterManager');
var TaskServiceManager = require('./aws/taskServiceManager');

var AWS_REGION = 'us-east-1';
AWS.config.region = AWS_REGION;

var ec2 = new AWS.EC2();
var ec2Manager = EC2Manager(ec2);

var ecs = new AWS.ECS();
var clusterManager = ClusterManager(ecs);
var taskServiceManager = TaskServiceManager(ecs);


/**
 * Updates app running on ECS cluster, this is used to prevent
 * unnecessary creation/destruction of resources. Use with caution.
 *
 * It does this by stopping all tasks and services running on the cluster.
 * Then rebuilds app by it's specification.
 */
function updateApp(clusterName, appDef) {
  util.info('Updating', appDef.name, 'on', clusterName, 'with app definition',
    '"' + appDef.name + '"');

  function loadNewApp() {
    return taskServiceManager.create(clusterName, appDef.name ,appDef);
  }

  return clusterManager.describe(clusterName)
    .then(R.prop('clusterArn'), q.reject)
    .then((clusterArn) => {
      util.info('Initiating cleanup on', clusterArn);
      return clusterArn;
    }, q.reject)

  .then(taskServiceManager.destroy, q.reject)
    .then((args) => {
      var serviceNames = R.map(R.prop('serviceName'), args);
      util.info('Deleted services', serviceNames);
      return args;
    }, q.reject)

  .then(loadNewApp, q.reject)
    .then((services) => {
      var f = R.compose(R.prop('serviceName'), R.prop('service'));
      var serviceNames = R.map(f, services);
      util.info('Initialized services', serviceNames);
      return services;
    }, q.reject);
}


/**
 * Destroys app running on ECS cluster
 *
 * It does this by stopping all tasks and services running on the cluster.
 * Then rebuilds app by it's specification.
 */
function destroyApp(clusterName) {
  util.info('Destroying', clusterName);

  return clusterManager.describe(clusterName)
    .then(R.prop('clusterArn'), q.reject)
    .then((clusterArn) => {
      util.info('Initiating cleanup on', clusterArn);
      return clusterArn;
    }, q.reject)

  .then(taskServiceManager.destroy, q.reject)
    .then((args) => {
      var serviceNames = R.map(R.prop('serviceName'), args);
      util.info('Deleted services', serviceNames);
      return args;
    }, q.reject);

  // TODO delete ECS cluster
  // TODO terminate EC2 container
}


/**
 * Creates:
 *  - ECS cluster
 *  - EC2 box with configured agent
 *  - Tasks / services from appDef
 *
 *  TODO clean up logs (q.reject all the things)
 */
function newApp(clusterName, appDef, ec2Config) {
  if (!clusterName) {
    throw 'Requires clusterName';
  }
  if (!appDef) {
    throw 'Requires appDef';
  }
  if (!ec2Config) {
    throw 'Requires ec2Config';
  }

  var clusterParams = {
    pr: 'test',
    pid: 'ha'
  };

  function buildEC2Instance() {
    return ec2Manager.create(ec2Config);
  }

  return clusterManager.create(clusterParams)
    .then(buildEC2Instance, util.errLog)
    .then(function() {
      return taskServiceManager.create(clusterName, appDef);
    });
}

function createAWSObjects() {
  const config = require('./config');
  const c = config();
  return {
    route53: new AWS.Route53(c),
    ec2: new AWS.EC2(c),
    ecs: new AWS.ECS(c)
  };
}


function describe(pr, type) {
  var a = createAWSObjects();
}

module.exports = {
  newApp: newApp,
  updateApp: updateApp,
  destroyApp: destroyApp,
  describe: describe
};
