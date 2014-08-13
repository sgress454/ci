/**
 * GithubController
 *
 * @description :: Server-side logic for managing githubs
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */

var spawn = require('child_process').spawn;

module.exports = {

  index: function(req, res) {

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

    async.series([
      function gitPull(cb) {
        var ps = spawn("git", ["pull"], {cwd: sails.config.localRepoPath});
        ps.stdout.on('data', console.log);
        ps.stderr.on('data', console.log);
        ps.on('close', function(code) {
          console.log("GIT PULL exited with code "+code);
          if (code !== 0) {
            return cb("Error: git pull exited with code "+code);
          }
          return cb();
        });
      },
      function npmUpdate(cb) {
        var ps = spawn("npm", ["update"], {cwd: sails.config.localRepoPath});
       	ps.stdout.on('data', console.log);
        ps.stderr.on('data', console.log);
        ps.on('close', function(code) {
          console.log("NPM UPDATE exited with code "+code);
          if (code !== 0) {
            return cb("Error: npm update exited with code "+code);
          }
          return cb();
        });
      }
    ], function done(err) {
      if (err) {return res.send(500, err);}
      return res.send(200, "Ok!")
    });

  }

};
