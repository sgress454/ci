/**
 * GithubController
 *
 * @description :: Server-side logic for managing githubs
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */

var spawn = require('child_process').spawn;

module.exports = {

  index: function(req, res) {

    sails.log("------------------------------------------");
    sails.log("Received request: ", new Date());

    var payload = req.body;

    // Make sure we have a payload
    if (!payload) {return res.send(500, "No payload received.");}

    // Make sure it's for the right repo
    if (payload.repository.full_name != sails.config.repository) {
      return res.send(500, "Sorry, I don't accept requests from the `"+payload.repository+"` repository.");
    }

    // Make sure it's for the right branch
    if (payload.ref != sails.config.ref) {
      return res.send("Ignoring request from the `"+payload.ref+"` branch; I only listen for `"+sails.config.ref+"` events.");
    }

    // Add a task to the queue to do a "git pull"
    QueueService.addGitPullTask();

    // Check if the package.json was modified by any commits
    if (_.any(payload.commits, function(commit) {
      return commit.modified.indexOf("package.json") !== -1;
    })) {
      // If so, add a task to do an npm update
      QueueService.addNpmInstallTask();
    }

    // If we're configured for it, add an "npm test" task
    if (sails.config.runTests) {
      QueueService.addTestTask();
    }

    res.send(200, "Ok!");
    sails.log("Sent ok response.");

  }

};

