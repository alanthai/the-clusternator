'use strict';
/**
 * Simplifies AWS EC2/VPC securityGroups
 *
 * @module aws/securityGroupManager
 */

const Q = require('q');
const common = require('./common');
const skeletons = require('./ec2Skeletons');
const util = require('../util');
const rid = require('../resource-identifier');
const constants = require('../constants');
const awsConstants = require('./aws-constants');

function getSecurityGroupManager(ec2, vpcId) {
  ec2 = util.makePromiseApi(ec2);
  var baseFilters = awsConstants.AWS_FILTER_CTAG.concat(
    common.makeAWSVPCFilter(vpcId));
  var describe = common.makeEc2DescribeFn(
    ec2, 'describeSecurityGroups', 'SecurityGroups', baseFilters);
  var describeProject = common.makeEc2DescribeProjectFn(describe);
  var describePr = common.makeEc2DescribePrFn(describe);
  var describeDeployment = common.makeEc2DescribeDeployment(describe);

  function defaultInOutRules(groupId) {
    const inbound = skeletons.SG_DEFAULT_INGRESS;
    const outbound = skeletons.SG_DEFAULT_EGRESS;

    inbound.GroupId = groupId;
    outbound.GroupId = groupId;

    return Q.all([
      ec2.authorizeSecurityGroupIngress(inbound),
      ec2.authorizeSecurityGroupEgress(outbound)
    ]).then(function() {
      return groupId;
    }, function(err) {
      //util.info('SecurityGroup: Warning Could Not Add Custom Rules: ' +
      //  err.message);
      return groupId;
    });
  }

  function rejectIfExists(pid, pr) {
    return describePr(pid, pr).then(function(list) {
      if (list.length) {
        throw new Error('SecurityGroup Exists For Project: ' + pid +
          ' PR: ' + pr);
      }
    });
  }


  /**
   * @param {string} pid
   * @param {string} pr
   * @returns {Q.Promise}
   */
  function createSecurityGroupPr(pid, pr) {
    const id = rid.generateRID({
        pid: pid,
        pr: pr
      });
    const params = {
        GroupName: id,
        Description: 'Created by clusternator for ' + pid + ', PR: ' + pr,
        VpcId: vpcId
      };
    return ec2.createSecurityGroup(params)
      .then((result) => {
        return Q.all([
          common.awsTagEc2(ec2, result.GroupId, [{
            Key: constants.CLUSTERNATOR_TAG,
            Value: 'true'
          }, {
            Key: constants.PROJECT_TAG,
            Value: pid
          }, {
            Key: constants.PR_TAG,
            Value: pr
          }]),
            defaultInOutRules(result.GroupId) ])
          .then(() => {
            util.info('result', result);
        return result;
      });
    });
  }

  /**
   * @param {string} pid
   * @param {string} deployment
   * @returns {Q.Promise}
   */
  function createSecurityGroupDeployment(pid, deployment) {
    const id = rid.generateRID({
        pid: pid,
        deployment: deployment
      });
    const params = {
        GroupName: id,
        Description: 'Created by clusternator for ' + pid + ', Deplyoment: ' +
        deployment,
        VpcId: vpcId
      };
    return ec2.createSecurityGroup(params).
    then(function(result) {
      return Q.all([
        common.awsTagEc2(ec2, result.GroupId, [{
          Key: constants.CLUSTERNATOR_TAG,
          Value: 'true'
        }, {
          Key: constants.PROJECT_TAG,
          Value: pid
        }, {
          Key: constants.DEPLOYMENT_TAG,
          Value: deployment
        }]),
        defaultInOutRules(result.GroupId)
      ]).then(function() {
        return result;
      });
    });
  }

  /**
   * @param {string} pid * @param {string} deployment
   * @returns {Q.Promise<string>}
   */
  function createDeployment(pid, deployment) {
    if (!pid || !deployment) {
      throw new TypeError('Create SecurityGroup requires a projectId, and a ' +
        'deployment label');
    }
    return describeDeployment(pid, deployment)
      .then((list) => {
        if (list.length) {
          // return the id
          util.info('Security Group Found For ', pid, ' Deployment: ',
            deployment);
          return list[0].GroupId;
        } else {
          // make a new one
          return createSecurityGroupDeployment(pid, deployment)
            .then((results) => results.GroupId);
        }
      });
  }

  /**
   * @param {string} pid
   * @param {string} pr
   * @returns {Q.Promise}
   */
  function createPr(pid, pr) {
    if (!pid || !pr) {
      throw new TypeError('Create SecurityGroup requires a projectId, and ' +
        'pull request #');
    }
    return rejectIfExists(pid, pr)
      .then(() => createSecurityGroupPr(pid, pr)
        .then((results) => results.GroupId ));
  }

  /**
   * @param {string} pid
   * @param {string} pr
   * @returns {Q.Promise}
   */
  function destroyPr(pid, pr) {
    if (!pid || !pr) {
      throw new Error('Destroy SecurityGroups requires a projectId, and a ' +
        'pull request #');
    }

    return describePr(pid, pr).then(function(list) {
      if (!list.length) {
        common.throwInvalidPidPrTag(pid, pr, 'looking', 'Group');
      }

      return ec2.deleteSecurityGroup({
        GroupId: list[0].GroupId
      });
    });
  }

  /**
   * @param {string} pid
   * @param {string} deployment
   * @returns {Q.Promise}
   */
  function destroyDeployment(pid, deployment) {
    if (!pid || !deployment) {
      throw new Error('Destroy SecurityGroups requires a projectId, and a ' +
        'deployment label');
    }

    return describeDeployment(pid, deployment).then(function(list) {
      if (!list.length) {
        common.throwInvalidPidPrTag(pid, deployment, 'looking', 'Group');
      }

      return ec2.deleteSecurityGroup({
        GroupId: list[0].GroupId
      });
    });
  }

  return {
    describe,
    describeProject,
    describePr,
    describeDeployment,
    createPr,
    createDeployment,
    destroyPr,
    destroyDeployment,
    helpers: {
      defaultInOutRules
    }
  };
}

module.exports = getSecurityGroupManager;
