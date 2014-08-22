var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var async = require('async');
var Machine = require('node-machine');
var path = require('path');
var fs = require('fs');

module.exports = function(cb) {

  if (sails.config.ciQueue.errorState) {
    sails.log("Skipping npm update due to previous errors...");
    return cb();
  }

  sails.log("Removing node_modules...");
  // Use the rmrf machine to clear the node_modules folder of the
  // configured local repo, synchronously.
  Machine.build(require('machinepack-fs/rmrf'))
  .configure({
    dir: path.resolve(sails.config.localRepoPath, "node_modules"),
    sync: true
  }).exec({
    success: function() {
      sails.log("Running `npm cache clear`...");
      // Run cache clear.  We can do this with `exec` because there's little
      // to no output, so no worries about overruning the buffer.
      var ps = exec("npm cache clear", function(err) {
        if (err) return cb("Error running `npm cache clear`: "+err);
        sails.log("Running `npm install`...");
        // Run `npm install`.
        ps = spawn("npm", ["install"], {cwd: sails.config.localRepoPath});
        // Save the child process in a global var in case we need to cancel
        // it later.
        sails.config.ciQueue.npmInstall = ps;
        // Capture output from `npm install` if we're in verbose logging mode
        ps.stdout.on('data', function(data) {
          sails.log.verbose(data.toString());
        });
        ps.stderr.on('data', function(data) {
          sails.log.verbose(data.toString());
        });
        // When `npm install` is done, signal that we're done with the task by
        // calling the callback
        ps.on('close', function(code) {
          sails.config.ciQueue.npmInstall = null;
          sails.log("`npm install` exited with code "+code);
          if (code !== 0) {
            return cb("Error: npm install exited with code "+code);
          }
          return cb();
        });
      });
    },
    error: function(err) {
      return handleError(cb, "Error while removing node_modules: "+ err +".");
    }
  });

};
