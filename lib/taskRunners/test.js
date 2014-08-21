var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var async = require('async');
var Machine = require('node-machine');
var path = require('path');
var fs = require('fs');

module.exports = function(cb) {

  if (sails.config.ciQueue.errorState) {
    sails.log("Skipping npm test due to previous errors...");
    return cb();
  }

  sails.log("Running `npm test`...");
  // Run `npm install`.
  var ps = spawn("npm", ["test"], {cwd: sails.config.localRepoPath});
  // Capture output from `npm test` if we're in verbose logging mode
  ps.stdout.on('data', function(data) {
    sails.log.verbose(data.toString());
  });
  ps.stderr.on('data', function(data) {
    sails.log.verbose(data.toString());
  });
  // When `npm install` is done, signal that we're done with the task by
  // calling the callback
  ps.on('close', function(code) {
    sails.log("`npm test` exited with code "+code);
    if (code !== 0) {
      return handleError(cb, "Error: npm install exited with code ");
    }
    return cb();
  });

};
