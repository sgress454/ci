/**
 * Bootstrap
 * (sails.config.bootstrap)
 *
 * An asynchronous bootstrap function that runs before your Sails app gets lifted.
 * This gives you an opportunity to set up your data model, run jobs, or perform some special logic.
 *
 * For more information on bootstrapping your app, check out:
 * http://sailsjs.org/#/documentation/reference/sails.config/sails.config.bootstrap.html
 */

module.exports.bootstrap = function(cb) {
  // Verify that config is okay
  if (!sails.config.repository || !sails.config.ref || !sails.config.localRepoPath) {
    return cb(new Error("Must have repository, ref and localRepoPath config!  Exiting..."));
  }
  if (!sails.config.localRepoScript) {
    sails.log.warn("No localRepoScript specified; assuming `app.js`...");
    sails.config.localRepoScript = "app.js";
  }
  // Set up the global queue
  QueueService.setupQueue();
  cb();
};
