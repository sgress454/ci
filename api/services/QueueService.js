var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var async = require('async');
var Machine = require('node-machine');
var path = require('path');
module.exports = {

  /**
   * Set up the global task queue
   */
  setupQueue: function() {

    // Create an async queue to hold tasks.  The target server will be relifted
    // whenever the queue is drained.  Set concurrency to "1" so that only one
    // task will be performed in a time (serial queue)
    sails.config.ciQueue = async.queue(taskRunner, 1);

    /**
     * Run a task that's been added to the queue
     * @param  {string}   task The name of the task to run
     * @param  {Function} cb   Callback
     */
    function taskRunner(task, cb) {

      // Local var to hold a child process
      var ps;

      // For "git" tasks, do a git pull from the configured repo
      if (task == 'git') {
        sails.log("Running `git pull`...");
        // Spawn a new process for the pull (in case output is too much for `exec`)
        ps = spawn("git", ["pull"], {cwd: sails.config.localRepoPath});
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
            return cb("Error: git pull exited with code "+code);
          }
          return cb();
        });
      }

      // For "npm" tasks, clear and re-install the node modules
      else if (task == 'npm') {
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
            ps = exec("npm cache clear", function(err) {
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
            return cb("Error while removing node_modules: ", err);
          }
        });
      }
    }

    /**
     * Called when all tasks in a queue are finished.
     */
    sails.config.ciQueue.drain = function() {

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
        ps = exec("forever start "+path.resolve(sails.config.localRepoPath, sails.config.localRepoScript), {cwd: sails.config.localRepoPath}, function(err) {
          if (err) {
            sails.log("Error on `forever stop "+scriptPath+"`: ", err);
            // handle error
          }
          sails.log("Finished `forever stop "+scriptPath+"`");

          sails.log("Server re-lifted on ", new Date());

          // Resume queue processing.
          sails.config.ciQueue.resume();
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
