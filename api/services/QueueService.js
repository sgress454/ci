var exec = require('child_process').exec;
var async = require('async');
var path = require('path');

var taskRunners = {
  npm: require(path.join(sails.config.appPath,"lib/taskRunners/npm.js")),
  git: require(path.join(sails.config.appPath,"lib/taskRunners/git.js")),
  test: require(path.join(sails.config.appPath,"lib/taskRunners/test.js"))
};

module.exports = {

  /**
   * Set up the global task queue
   */
  setupQueue: function() {

    // Create an async queue to hold tasks.  The target server will be relifted
    // whenever the queue is drained.  Set concurrency to "1" so that only one
    // task will be performed in a time (serial queue)
    sails.config.ciQueue = async.queue(function(task, cb) {
      return taskRunners[task](cb);
    }, 1);

    sails.config.ciQueue.errorState = false;

    /**
     * Called when all tasks in a queue are finished.
     */
    sails.config.ciQueue.drain = function() {

      if (sails.config.ciQueue.errorState) {
        sails.log("Skipping npm update due to previous errors...");
        return;
      }

      // Pause queue processing, so that any tasks added while doing our server
      // restart won't be processed until we're done.
      sails.config.ciQueue.pause();

      var scriptPath = path.resolve(sails.config.localRepoPath, sails.config.localRepoScript);
      sails.log("Running `forever stop "+scriptPath+"`...");
      // Restart the target server.
      var ps = exec("forever stop "+scriptPath, function(err) {
        if (err) {
          sails.log("Error on `forever stop "+scriptPath+"`: ", {cwd: sails.config.localRepoPath}, err);
          // handle error
        }
        sails.log("Finished `forever stop`");

        sails.log("Running `forever start "+scriptPath+"`...");
        var cmd = "forever start "+path.resolve(sails.config.localRepoPath, sails.config.localRepoScript);

        // Set an environment if directed
        if (sails.config.targetEnvironment) {
          cmd = "NODE_ENV="+sails.config.targetEnvironment+" "+cmd;
        }

        ps = exec(cmd, {cwd: sails.config.localRepoPath}, function(err) {
          if (err) {
            sails.log("Error on `forever stop "+scriptPath+"`: ", err);
            // handle error
          }
          sails.log("Finished `forever start "+scriptPath+"`");

          sails.log("Server re-lifted on ", new Date());

          // Resume queue processing.
          sails.config.ciQueue.resume();

          // Send an email if requested
          if (sails.config.sendEmailOnSuccess) {
            var server = sails.getHost() || 'server';
            sails.hooks.email.send("success", {
              server: server,
              repo: sails.config.repository,
              branch: sails.config.ref.split('/').pop(),
              date: new Date()
            },
            {
              to: sails.config.sendEmailTo,
              subject: "Successful deploy of "+sails.config.repository+" on "+server
            }, function(err){
              if (err) {sails.log.error("MAIL ERR", err);}
            });
          }
        });

      });

    };

  },

  /**
   * Add a "git" task to the queue
   */
  addGitPullTask: function() {
    sails.log("Queueing `git pull` task...");
    sails.config.ciQueue.push("git");
  },

  /**
   * Add a "test" task to the queue
   */
  addTestTask: function() {
    sails.log("Queueing `npm test` task...");
    sails.config.ciQueue.push("test");
  },

  /**
   * Add an "npm" task to the queue
   */
  addNpmInstallTask: function() {
    sails.log("Queueing `npm install` task...");
    // If an npm install is already going, we'll want to cancel it
    // since there's no sense in installing everything twice.
    if (sails.config.ciQueue.npmInstall) {
      // Pause queue processing so that killing the task doesn't
      // result in the next task immediately being run
      sails.config.ciQueue.pause();
      // Push the new npm task on to the queue
      sails.config.ciQueue.push("npm");
      // Hook up the "close" event of the currently running npm
      // task so that it triggers resumption of the queue
      sails.config.ciQueue.npmInstall.once("close", function() {
        sails.config.ciQueue.resume();
      });
      sails.log("(canceling `npm install` in progress...)");
      // Kill the currently running `npm install` task
      sails.config.ciQueue.npmInstall.kill();
    }
    // Otherwise just add the `npm install` task to the queue
    else {
      sails.config.ciQueue.push("npm");
    }
  }

};
