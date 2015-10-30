'use strict';

var Q = require('q');
var R = require('ramda');
var util = require('../util');
var constants = require('../constants');

var AMI_ID = constants.AWS_DEFAULT_EC2_AMI; // amzn-ami-2015.03.d-amazon-ecs-optimized
var EC2_INSTANCE_TYPE = constants.AWS_DEFAULT_EC2_TYPE;

//var DEFAULT_SECURITY_GROUP = 'sg-356bb652'; // Default SG allows all traffic

// NETWORK INTERFACE MUST HAVE MATCHING SECURITY GROUP
//var NETWORK_INTERFACE_ID = 'eni-66bd8349';

function getECSContainerInstanceUserData(clusterName, auth) {

  var data = ['#!/bin/bash', 'echo ECS_CLUSTER=' + clusterName + ' >> /etc/ecs/ecs.config;'];

  if (auth) {

    console.log(auth);

    if (!auth.cfg && (!auth.username || !auth.password || !auth.email)) {
      throw 'Auth should contain a username, password, and email';
    }

    var authJson;
    var cfgType;

    if (auth.cfg) {
      authJson = JSON.parse(auth.cfg);
      cfgType = 'dockercfg';
    } else {
      authJson = {
        'https://index.docker.io/v1/user': auth
      };
      cfgType = 'docker';
    }

    var authStr = JSON.stringify(authJson);

    var authType = 'echo ECS_ENGINE_AUTH_TYPE=' + cfgType + ' >> /etc/ecs/ecs.config;';
    var authData = 'echo ECS_ENGINE_AUTH_DATA=' + authStr + ' >> /etc/ecs/ecs.config;';

    data.push(authType);
    data.push(authData);
  }

  var bash = data.join('\n');

  console.log('fuck');
  console.log(bash);

  var buf = new Buffer(bash);
  return buf.toString('base64');
}

var DEFAULT_INSTANCE_PARAMS = {
  ImageId: AMI_ID,
  MaxCount: 1,
  MinCount: 1,

  DisableApiTermination: false,

  IamInstanceProfile: {
    Name: 'ecsInstanceRole'
  },

  EbsOptimized: false,

  // XXX Should they terminate on shutdown?
  InstanceInitiatedShutdownBehavior: 'terminate',

  InstanceType: EC2_INSTANCE_TYPE,

  // XXX IF YOU WANT TO SSH INTO THIS BOX THIS HAS TO BE SUPPLIED
  //KeyName: 'STRING_VALUE',

  Monitoring: {
    // TODO investigate
    Enabled: true /* required */
  },

  NetworkInterfaces: [{
    DeviceIndex: 0,
    //NetworkInterfaceId: NETWORK_INTERFACE_ID,
    AssociatePublicIpAddress: true,
    SubnetId: 'subnet-0b251420',
    DeleteOnTermination: true,
    Groups: ['sg-692ee50e']
  }],

  Placement: {
    Tenancy: 'default'
  }

  // TODO INSTALL ECS AGENT HERE
  //UserData: 'STRING_VALUE'
};

function getEC2Manager(ec2) {

  function tagInstance(instance, pr, pid) {
    return util.awsTagEc2(ec2, instance.InstaneId, [{
      Key: constants.CLUSTERNATOR_TAG,
      Value: 'true'
    }, {
      Key: constants.PR_TAG,
      Value: pr
    }, {
      Key: constants.PROJECT_TAG,
      Value: pid
    }]);
  }

  /**
   * @param config Object
   * config will merge with default ec2 config
   */
  function buildEc2Box(config) {
    if (!config) {
      throw 'This function requires a configuration object';
    }

    var clusterName = config.clusterName;
    if (!config.clusterName) {
      throw 'Instance requires cluster name';
    }

    var auth = config.auth;
    var apiConfig = config.apiConfig;
    apiConfig.UserData = getECSContainerInstanceUserData(clusterName, auth);

    var params = R.merge(DEFAULT_INSTANCE_PARAMS, apiConfig);

    return Q.nbind(ec2.runInstances, ec2)(params).then(function (results) {
      var tagPromises = [];
      results.Instances.forEach(function (instance) {
        tagPromises.push(tagInstance(instance, config.pr, config.pid));
      });
      return Q.all(tagPromises);
    });
  }

  /**
   *  @param instanceIds Array
   */
  function checkInstanceStatuses(instanceIds) {
    if (!instanceIds.length) {
      throw 'No instance IDs';
    }

    var params = {
      InstanceIds: instanceIds
    };

    return Q.nbind(ec2.describeInstances, ec2)(params);
  }

  return {
    createEC2Instance: buildEc2Box,
    checkInstanceStatus: checkInstanceStatuses
  };
}

module.exports = getEC2Manager;