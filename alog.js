var http = require("http"), url = require("url"), form = require("./lib/cb-forms"), mime = require("mime");
var mongo = require('./lib/mongo-driver/node-mongodb-native/lib/mongodb');
var fs = require("fs");
var config = require("./config").config;

var db = new mongo.Db("local", new mongo.Server("127.0.0.1", 27017, {}));

var dbClient;
db.open(function(err, client) {
    dbClient = client;
});

var withAlogDb = function(cb) {
    dbClient.collection("consumptions", function(err, consumptions) {
        if (err) {
            throw err;
        }
        cb(consumptions);
    });
};

var sendResponse = function(response, data) {
    response.writeHead(200, {"Content-Type": "application/json"});
    response.end(JSON.stringify(data) + "\n", "utf8");
};

var sendError = function(response, code, msg) {
    response.writeHead(code || 500, {"Content-Type": "text/plain"});
    response.end(msg || "ERROR", "utf8");
};

var checkAuthToken = function(token) {
    return token === config.token;
};

var handleStatic = function(request, response, resource) {
    console.log("serving " + resource);
    fs.readFile("./static/" + resource, function (err, data) {
        if (!err) {
            var contentType = mime.lookup(resource);
            if (contentType === "text/html") {
                contentType += ";charset=UTF-8";
            }
            response.writeHead(200, {'Content-Type': contentType});
            response.end(data);
        } else {
            sendError(response, 404, "NOT FOUND");
        }
    });
};

var handleAdd = function(request, response) {
    console.log("add0");
    form.onData(request, function(data) {
        if (checkAuthToken(data.token)) {
            console.log("add");
            withAlogDb(function(consumptions) {
                var consumption = {};
                consumption.eid = data.eid
                consumption.quantity = parseFloat(data.quantity);
                consumption.date = parseInt(data.date, 10);
                consumption.addTs = new Date().getTime();

                consumptions.insert(consumption, {safe: true}, function(err, docs) {
                    if (!err) {
                        sendResponse(response, {ok: true, eid: consumption.eid});
                    } else {
                        sendResponse(response, {ok: false, error: err});
                    }
                });
            });
        } else {
            sendError(response, 403, "ACCESS DENIED");
        }
    });
};

var handleUpdate = function(request, response) {
    form.onData(request, function(data) {
        if (checkAuthToken(data.token)) {
            console.log("update");
            sendResponse(response, {updated:true});
        } else {
            sendError(response, 403, "ACCESS DENIED");
        }
    });
};

var handleDelete = function(request, response) {
    form.onData(request, function(data) {
        if (checkAuthToken(data.token)) {
            console.log("delete");
            sendResponse(response, {deleted:true});
        } else {
            sendError(response, 403, "ACCESS DENIED");
        }
    });
};

var handleQuery = function(request, response) {
    var reqUrl = url.parse(request.url, true);
    if (checkAuthToken(reqUrl.query.token)) {
        var from = parseInt(reqUrl.query.from, 10);
        var to = parseInt(reqUrl.query.to, 10);
        console.log("query");
        withAlogDb(function(consumptions) {
                consumptions.find({date:{$gte: from, $lt: to}}).toArray(function(err, docs) {
                    if (!err) {
                        sendResponse(response, {ok: true, from:from, to:to, alkData: docs});
                    } else {
                        sendResponse(response, {ok: false, error: err});
                    }
                });
        });
    } else {
        sendError(response, 403, "ACCESS DENIED");
    }
};

var staticRe = /^\/static\/([\w\.]+)$/;
var alkRe = /^\/alk\/?$/;
var updateRe = /^\/alk\/[a-z0-9]{16}\/?$/;
var deleteRe = /^\/alk\/[a-z0-9]{16}\/del\/?$/;

http.createServer(function (request, response) {
    var reqUrl = url.parse(request.url);

    console.log("----- " + request.connection.remoteAddress + " " + reqUrl.href + " -----");
    if (alkRe.test(reqUrl.pathname)) {
        if (request.method === "GET") {
            handleQuery(request, response);
        } else if (request.method === "POST") {
            handleAdd(request, response);
        } 
    } else if (updateRe.test(reqUrl.pathname)) {
        handleUpdate(request, response);
    } else if (deleteRe.test(reqUrl.pathname)) {
        handleDelete(request, response);
    } else if (staticRe.test(reqUrl.pathname)) {
        handleStatic(request, response, staticRe.exec(reqUrl.pathname)[1]);
    } else {
        console.log("ignoring");
        sendError(response, 404, "NOT FOUND");
    }
}).listen(13666);



