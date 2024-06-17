var proc = require('child_process');
var fs = require("fs");
var url = require("url");
var querystring = require("querystring");
var msgpack = require("msgpack-lite");

module.exports = {
  
  auth: false,
  authUsers: {},
  
  settingsDir: "/etc/iptables/config.json",
  _settings: {
    savePath: "/etc/iptables/rules.save",
    user: "admin",
    pass: "",
    theme: "Silver",
    themes: []
  },
  
  loadSettings: function() {
    fs.exists(module.exports.settingsDir, function(ex) {
      if(ex) {
        fs.readFile(module.exports.settingsDir, [], function(err, data) {
          // Restore new settings after load from file
          var s = module.exports._settings;
          module.exports._settings = JSON.parse(data);
          for(var key in s) {
            if(!module.exports._settings[key]) {
              module.exports._settings[key] = s[key];
            }
          }
          module.exports.auth = module.exports._settings.pass === "";
          console.log("Load settings from " + module.exports.settingsDir);
        });
      }
    });
  },
  
  saveSettings: function() {
    fs.writeFile(module.exports.settingsDir, JSON.stringify(module.exports._settings), function(err) {
      if(err) {
        return console.log(err);
      }
      console.log("Settings saved to file " + module.exports.settingsDir);
    });
  },
  
  index: function(req, res) {
    fs.readFile('./tpl/index.html', [], function(err, data) {
      //res.writeHead(320, {"Content-Type": "text/plain"});
      res.end(data);
    });
  },
  
  showChannel: function(req, res) {
    var query = url.parse(req.url).query;
    var args = querystring.parse(query);

    if ('d' in args) { //delete chain
      //args.c = "INPUT";
      var arr = []; // not processed anyway
      res.end(msgpack.encode(arr).toString('base64'));
      return;
    }
    var run = "iptables -t " + args.t + " -S " + args.c;
    console.log(run);
    proc.exec(run, function(error, stdout, stderr) {
      if(stderr) {
        console.log(stderr);
        if (stderr.includes('is incompatible')) {
          var arr = []; // not processed anyway
          res.end(msgpack.encode(arr).toString('base64'));
        }
        else {
          res.end(msgpack.encode(stderr).toString('base64'));
        }
      }
      else {
        var arr = stdout.split("\n");

        res.end(msgpack.encode(arr).toString('base64'));
      }
    });
  },
  
  deleteRule: function(req, res) {
    var query = url.parse(req.url).query;
    var args = querystring.parse(query);
    
    var rule = "-t " + args.t + " -D " + args.c + " " + args.i;
    console.log("iptables " + rule);
    proc.exec("iptables " + rule, function(error, stdout, stderr) {
      if(stderr) {
        console.log(stderr);
        res.end(msgpack.encode(stderr).toString('base64'));
      }
      else {
        //no output, show same chain

        module.exports.showChannel(req, res);
      }
    });
  },
  
  insertRule: function (req, res) {
    var body = '';
    req.on('data', function (data) {
      body += data;
    });
    req.on('end', function () {
      var query = url.parse(req.url).query;
      var args = querystring.parse(query);
      var post = querystring.parse(body);
        
      var rule = post['rule'];
      console.log("iptables " + rule);
      proc.exec("iptables " + rule, function(error, stdout, stderr) {
        if(stderr) {
          console.log(stderr);
          res.end(msgpack.encode(stderr).toString('base64'));
        }
        else {
          //no output, show same chain

          module.exports.showChannel(req, res);
        }
      });
    });
  },
  
  monitor: function(req, res) {
    var query = url.parse(req.url).query;
    var args = querystring.parse(query);

    var run = "iptables -t " + args.t + " -L " + args.c + " -vn";
    console.log(run);
    proc.exec(run, function(error, stdout, stderr) {
      if(stderr) {
        console.log(stderr);
        res.end(msgpack.encode(stderr).toString('base64'));
      }
      else {
        var arr = stdout.split("\n");

        res.writeHead(200, {"Cache-Control": "no-cache"});
        res.end(msgpack.encode(arr).toString('base64'));
      }
    });
  },
  
  chainList: function(req, res) {
    var new_arr = [];
    var n = 0;
    
    console.log("iptables -S");
    proc.exec("iptables -S", function(error, stdout, stderr) {
      var arr = stdout.split("\n");
      
      var n = 0;
      for(var i = 0; i < arr.length; i++) {
        var item = arr[i];
        if(item.indexOf("-N") === 0) {
          new_arr[n++] = item.substring(3) + " (filter)";
        }
      }
      
      console.log("iptables -t nat -S");
      proc.exec("iptables -t nat -S", function(error, stdout, stderr) {
        var arr = stdout.split("\n");

        for(var i = 0; i < arr.length; i++) {
          var item = arr[i];
          if(item.indexOf("-N") === 0) {
            new_arr[n++] = item.substring(3) + " (nat)";
          }
        }

        console.log("iptables -t mangle -S");
        proc.exec("iptables -t mangle -S", function(error, stdout, stderr) {
          if(stderr) {
            console.log(stderr);
            res.end(msgpack.encode(stderr).toString('base64'));
          }
          else {
            var arr = stdout.split("\n");

            for(var i = 0; i < arr.length; i++) {
              var item = arr[i];
              if(item.indexOf("-N") === 0) {
                new_arr[n++] = item.substring(3) + " (mangle)";
              }
            }
          
            res.end(msgpack.encode(new_arr).toString('base64'));
          }
        });
      });
    });
  },
    
    save: function(req, res) {
      console.log("iptables-save > " + module.exports._settings.savePath);
      proc.exec("iptables-save > " + module.exports._settings.savePath, function(error, stdout, stderr) {
        if(stderr) {
          console.log(stderr);
          res.end(stderr);
        }
        else {
          res.end();
        }
      });
    },
    
    load: function(req, res) {
      console.log("iptables-restore < " + module.exports._settings.savePath);
      proc.exec("iptables-restore < " + module.exports._settings.savePath, function(error, stdout, stderr) {
        if(stderr) {
          console.log(stderr);
          res.end(stderr);
        }
        else {
          res.end();
        }
      });
    },
  
  settings: function(req, res) {
    var query = url.parse(req.url).query;
    var args = querystring.parse(query);
    
    if(args.c === "save") {
      var body = '';
      req.on('data', function (data) {
        body += data;
      });
      req.on('end', function () {
        var post = querystring.parse(body);
        var data = post['data'];
                
        var raw_data = Buffer.from(data, 'base64');
        module.exports._settings = msgpack.decode(raw_data);
        module.exports.saveSettings();
      });
      res.end();
    }
    else {
      var themes = [];
      var items = fs.readdirSync("./tpl/theme");
      for (var item of items) {
        themes.push(item.substring(0, item.length-4));
      }
      module.exports._settings.themes = themes;
      res.end(msgpack.encode(module.exports._settings).toString('base64'));
    }
  },
  
  authMe: function(req, res) {
    var pathname = url.parse(req.url).pathname;
    
    if(pathname === "/login") {
      var body = '';
      req.on('data', function (data) {
        body += data;
      });
      req.on('end', function () {
        var post = querystring.parse(body);
        var login = post['login'];
        var pass = post['pass'];

        var auth = login === module.exports._settings.user && pass === module.exports._settings.pass;
        if(auth) {
          var ip = req.connection.remoteAddress;
          module.exports.authUsers[ip] = 1;

          res.writeHead(301, {"Location": "/"});
          res.end();
        }
        else {
          res.end("Login error!");
        }
      });
    }
    else {
      res.writeHead(301, {"Location": "auth.html", "Cache-Control": "no-cache"});
      res.end();
    }
  },
  
  isAuth: function(req) {
    var ip = req.connection.remoteAddress;
    return module.exports.auth || module.exports.authUsers[ip];
  },
  
  logout: function(req, res) {
    var ip = req.connection.remoteAddress;
    module.exports.authUsers[ip] = 0;

    res.writeHead(301, {"Location": "auth.html", "Cache-Control": "no-cache"});
    res.end();
  },
  
  userList: function(req, res) {
    for(var ip in module.exports.authUsers) {
      res.write("IP: " + ip + " " + (module.exports.authUsers[ip] ? "auth" : "none"));
    }
    res.end();
  }
};

module.exports.loadSettings();
