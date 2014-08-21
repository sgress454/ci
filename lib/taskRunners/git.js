var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var async = require('async');
var Machine = require('node-machine');
var path = require('path');
var fs = require('fs');

module.exports = function(cb) {

  // Clear the error state.
  sails.config.ciQueue.errorState = false;

  async.series({

    storeCommit: function(cb) {

      sails.log.verbose("Getting current commit via `git rev-parse HEAD`...");
      // Get the current commit or ref
      exec("git rev-parse HEAD", {cwd: sails.config.localRepoPath}, function(err, data) {
        if (err) {return cb("Couldn't read current commit via git rev-parse HEAD");}
        data = data.trim();
        sails.log.verbose("Got commit `"+data+"`");
        fs.writeFile(path.join(sails.config.appPath, ".commit"), data, function(err) {
          if (err) {return handleError(cb, "Couldn't read write commit to .commit.");}
          cb();
        });
      });
    },

    checkoutBranch: function(cb) {

      // Get the branch we want to pull from
      var branch = sails.config.ref.split('/').pop();

      // Switch to that branch
      sails.log.verbose("Checking out branch `"+branch+"`...");
      exec("git checkout "+branch, {cwd: sails.config.localRepoPath}, function(err) {
        if (err) {
          return handleError(cb, "Couldn't checkout branch `"+branch+"`; got: "+err);
        }
        cb();
      });

    },

    pull: function(cb) {

      sails.log("Running `git pull`...");
      // Spawn a new process for the pull (in case output is too much for `exec`)
      var ps = spawn("git", ["pull"], {cwd: sails.config.localRepoPath});
      // Capture output from `git pull` if we're in verbose logging mode
      ps.stdout.on('data', function(data) {
        sails.log.verbose(data.toString());
      });
      ps.stderr.on('data', function(data) {
        sails.log.verbose(data.toString());
      });
      // When `git pull` is done, signal that we're done with the task by
      // calling the callback
      ps.on('close', function(code) {
        sails.log("`git pull` exited with code "+code);
        if (code !== 0) {
          return handleError(cb, "Error: git pull exited with code "+code);
        }
        return cb();
      });

    }


  }, cb);


};
