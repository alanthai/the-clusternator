'use strict';
/**
 * Authentication layer/execution layer that sits between {@link module:server}
 * and {@link module:api/'0.1'/rest}
 *
 * @module server/'api-0.1'
 */

const constants = require('../../constants');
const API = constants.DEFAULT_API_VERSION;

const passport = require('passport');
const R = require('ramda');

const Config = require('../../config');
const logger = require('../loggers').logger;
var getCommands = require(`../../api/${API}/rest/rest-api`);
var auth = require('../auth/authorities');
var curryPrivFromNamespace = R.curry(commandPrivFromNamespace);

module.exports = {
  init
};

/**
 * @param {Object} config
 * @param {string} namespace
 * @param {string} command
 * @returns {*}
 */
function commandPrivFromNamespace(config, namespace, command) {
  var cp = config.commandPrivileges;
  if (!cp) {
    return null;
  }
  cp = cp[namespace];
  if (!cp) {
    return null;
  }
  cp = cp[command];
  if (cp === undefined) {
    return null;
  }
  return cp;
}

/**
 * @param {Resource} res
 * @returns {Function}
 */
function getPFail(res) {
  return (err) => {
    res.status(500).json({ error: err.message });
  };
}

/**
 * @param {Resource} res
 */
function noAuthority(res) {
  res.status(403).json({ error: 'Not Authorized'});
}

function authorizeCommand(config) {
  var cmdP = curryPrivFromNamespace(config);

  return (req, res, next) => {
    var ns = req.params.namespace, cmd = req.params.command,
      requiredAuth = cmdP(ns, cmd);

      logger.debug(`Attempting to authorize: ${req.user.id} For: ${ns}.${cmd}`);

      auth.find(req.user.id).then((userAuth) => {
        if (+userAuth.authority <= +requiredAuth) {
          logger.info(`Authorized: ${req.user.id} On: ${ns}.${cmd}`);
          next();
          return;
        }
        logger.warn(`NOT AUTHORIZED: ${req.user.id} On: ${ns}.${cmd}`);
        noAuthority(res);
      }).fail(getPFail(res));
  };
}

function executeCommand(commands) {

  return (req, res) => {
    logger.info('Attempting To Execute Command', req.params.namespace,
      req.params.command, req.body);

    if (!commands[req.params.namespace]) {
      getPFail(res)(new Error('Invalid Command (bad namespace)'));
      return;
    }
    const fn = commands[req.params.namespace][req.params.command];

    if (typeof fn !== 'function') {
      getPFail(res)(new Error('Invalid Command (bad function)'));
      return;
    }

    logger.info('executing command', req.params.namespace, req.params.command,
      req.body);

    fn(req.body)
      .then((output) => res.json(output))
      .fail(getPFail(res));
  };
}

function init(app) {
  const config = Config();
  logger.debug(`API ${API} Initializing`);

  const commands = getCommands(config, app.locals.projectDb);
  logger.debug(`API ${API} Got CommandObjects`);

  app.post(`/${API}/:namespace/:command`, [
    passport.authenticate(['auth-header']),
    authorizeCommand(config),
    executeCommand(commands)
  ]);
}
