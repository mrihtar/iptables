var http = require('http');
var handle = require('./handlers');
var url = require("url");
var fs = require("fs");
var msgpack = require("msgpack-lite");

var handles = {};
handles["/"] = handle.index;
handles["/channel"] = handle.showChannel;
handles["/delete"] = handle.deleteRule;
handles["/insert"] = handle.insertRule;
handles["/mon"] = handle.monitor;
handles["/save"] = handle.save;
handles["/load"] = handle.load;
handles["/settings"] = handle.settings;
handles["/chainlist"] = handle.chainList;
handles["/login"] = handle.authMe;
handles["/logout"] = handle.logout;
handles["/users"] = handle.userList;

http.createServer(function handler(req, res) {
    var pathname = url.parse(req.url).pathname;
    
    req.setEncoding("utf8");
    
    if (handles[pathname]) {
      if(handle.isAuth(req)) {
        handles[pathname](req, res);
      }
      else {
        handle.authMe(req, res);
      }
    }
    else {
      var file = "./tpl" + pathname;
    
      fs.exists(file, function(ex) {
        if(ex) {
          fs.readFile(file, [], function(err, data) {
            //res.writeHead(320, {"Content-Type": "text/plain"});
            res.end(data);
          });
        }
        else {
          console.log("No request handler found for " + pathname);
          res.writeHead(404, {"Content-Type": "text/plain"});
          res.write("404 Not found");
          res.end();
        }
      });
    }
}).listen(2337);
console.log('Server running at http://*:2337/');

// ------------------ WebSocket ------------------------------------------------
var proc = require('child_process');
var ws = require("nodejs-websocket");
var log = null;
var dump = null;

function closeLogs() {
  if(log) {
    log.kill('SIGHUP');
    log = null;
  }
}

function closeDump() {
  if(dump) {
    dump.kill('SIGHUP');
    dump = null;
  }
}

var server = ws.createServer(function (conn) {
  conn.on("text", function (data) {
    var raw_data = Buffer.from(data, 'base64');
    var params = msgpack.decode(raw_data);
    if(params.name == "syslog") {
      try {
        log = proc.spawn("tail", ["-100f", "/var/log/syslog"]);
        log.stdout.on('data', function (lines) {
          var outData = {name: params.name, data: lines.toString().replace(/\r+/g,'').split("\n")};
          conn.sendText(msgpack.encode(outData).toString('base64'));
        });
        log.stderr.on('data', function (lines) {
          var outData = {name: params.name, data: lines.toString().replace(/\r+/g,'').split("\n")};
          conn.sendText(msgpack.encode(outData).toString('base64'));
        });
        log.on('error', function(err) {
          console.log(err);
          var outData = {name: params.name, data: err.toString().replace(/\r+/g,'').split("\n")};
          conn.sendText(msgpack.encode(outData).toString('base64'));
        });
      } catch(err) {
        console.log(err);
        var outData = {name: params.name, data: err.toString().replace(/\r+/g,'').split("\n")};
        conn.sendText(msgpack.encode(outData).toString('base64'));
      }
    }
    else if(params.name == "dump") {
      var args = ["-i", params.eth, "-n", "-l"];
      if(params.port) {
        args.push("port", params.port);
      }
      if(params.src) {
        args.push("src", params.src);
      }
      if(params.dst) {
        if(params.src) {
          args.push("or");
        }
        args.push("dst", params.dst);
      }
      conn.sendText(msgpack.encode({name: params.name, data: ["Exec tcpdump with args: " + args.toString()]}).toString('base64'));
      try {
        dump = proc.spawn("tcpdump", args);
        dump.stdout.on('data', function (lines) {
          var outData = {name: params.name, data: lines.toString().replace(/\r+/g,'').split("\n")};
          conn.sendText(msgpack.encode(outData).toString('base64'));
        });
        dump.stderr.on('data', function (lines) {
          var outData = {name: params.name, data: lines.toString().replace(/\r+/g,'').split("\n")};
          conn.sendText(msgpack.encode(outData).toString('base64'));
        });
        dump.on('error', function(err) {
          console.log(err);
          var outData = {name: params.name, data: err.toString().replace(/\r+/g,'').split("\n")};
          conn.sendText(msgpack.encode(outData).toString('base64'));
        });
      } catch(err) {
        console.log(err);
        var outData = {name: params.name, data: err.toString().replace(/\r+/g,'').split("\n")};
        conn.sendText(msgpack.encode(outData).toString('base64'));
      }
    }
    else if(params.name == "closelog") {
      closeLogs();
    }
    else if(params.name == "closedump") {
      closeDump();
    }
  });
  conn.on("close", function (code, reason) {
    closeLogs();
    closeDump();
  });
}).listen(8001);
