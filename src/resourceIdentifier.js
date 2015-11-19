'use strict';

var R = require('ramda'),
constants = require('./constants');


var VALID_ID_TYPES = ['pr', 'sha', 'time', 'ttl', 'pid', 'deployment'];


// TODO add clusternator prefix

/**
 * RID format: typeA-valueA--typeB-valueB
 */
function parseRID(rid) {
  if (rid.indexOf(constants.CLUSTERNATOR_PREFIX) !== 0) {
    return null;
  }
  rid = rid.slice(constants.CLUSTERNATOR_PREFIX.length + 1);
  var doubleDashRegex = /--/g;

  var splits = rid.split(doubleDashRegex);

  var segments = R.map((idSegment) => {
    var dashIdx = idSegment.indexOf('-');
    var type = idSegment.substring(0, dashIdx);
    var value = idSegment.substring(dashIdx + 1);

    return {
      type: type,
      value: value
    };
  }, splits);

  var result = R.reduce(function (memo, seg) {
    memo[seg.type] = seg.value;
    return memo;
  }, {}, segments);

  return result;
}


function generateRID(params) {
  var idSegments = R.mapObjIndexed(function (val, key, obj) {
    return key + '-' + val;
  }, params);

  var validSegmentKeys = R.filter((key) => {
    return R.contains(key, VALID_ID_TYPES);
  }, R.keys(idSegments));

  var rid = R.reduce(function (ridStr, segKey) {
    var idSeg = idSegments[segKey];
    return ridStr + idSeg + '--';
  }, '', validSegmentKeys);

if (!rid) {
  return '';
}
  // Remove trailing --
  return constants.CLUSTERNATOR_PREFIX + '-' + rid.replace(/--$/g, '');
}

/**
  @param {string} projectId
  @param {string} pr
*/
function generatePRSubdomain(projectId, pr) {
  if (!projectId || !pr) {
    throw new TypeError('generateSubdomain requires a projectId, and pr');
  }
  return projectId + '-pr-' + pr;
}

/**
  @param {string} projectId
  @param {string} label
*/
function generateSubdomain(projectId, label) {
  if (!projectId || !label) {
    throw new TypeError('generateSubdomain requires a projectId, and label');
  }
  return projectId + '-' + label;
}

module.exports = {
  parseRID,
  generateRID,
  generatePRSubdomain,
  generateSubdomain
};
