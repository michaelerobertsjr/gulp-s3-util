'use strict';

var es = require('event-stream');
var knox = require('knox');
var gutil = require('gulp-util');
var mime = require('mime');
var async = require('async');
mime.default_type = 'text/plain';

module.exports = function (aws, options, done) {
  options = options || {};

  if (!options.delay) { options.delay = 0; }

  var client = knox.createClient(aws);
  var regexGzip = /\.([a-z]{2,})\.gz$/i;
  var regexGeneral = /\.([a-z]{2,})$/i;
  var files = [];

  return es.through(function write (data) {
    files.push(data);
  }, function end () {
    var self = this;

    async.eachLimit(files, options.asyncLimit || 4, function (file, cb) {
      // Verify this is a file
      if (!file.isBuffer()) { return cb(); }

      var uploadPath = file.path.replace(file.base, options.uploadPath || '');
      uploadPath = uploadPath.replace(new RegExp('\\\\', 'g'), '/');
      var headers = { 'x-amz-acl': 'public-read' };
      if (options.headers) {
        for (var key in options.headers) {
          headers[key] = options.headers[key];
        }
      }

      if (regexGzip.test(file.path)) {
        // Set proper encoding for gzipped files, remove .gz suffix
        headers['Content-Encoding'] = 'gzip';
        uploadPath = uploadPath.substring(0, uploadPath.length - 3);
      } else if (options.gzippedOnly) {
        // Ignore non-gzipped files
        return cb();
      }

      // Set content type based of file extension
      if (!headers['Content-Type'] && regexGeneral.test(uploadPath)) {
        headers['Content-Type'] = mime.lookup(uploadPath);
        if (options.encoding) {
          headers['Content-Type'] += '; charset=' + options.encoding;
        }
      }

      headers['Content-Length'] = file.stat.size;

      client.putBuffer(file.contents, uploadPath, headers, function(err, res) {
        if (err || res.statusCode !== 200) {
          gutil.log(gutil.colors.red('[FAILED]', file.path + " -> " + uploadPath + " (" + (res && res.statusCode) + ")" + " (" + err + ")"));
          cb(err);
        } else {
          gutil.log(gutil.colors.green('[SUCCESS]', file.path + " -> " + uploadPath));
          res.resume();
          self.emit('data', file);
          cb(null);
        }
      });
    }, function (err) {
      self.emit('end', err);
      if (typeof done === 'function') {
        done();
      }
    });
  });
};
