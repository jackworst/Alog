var http = require("http"), url = require("url"), form = require("./lib/cb-forms"), mime = require("mime");
var mongo = require('./lib/mongo-driver/node-mongodb-native/lib/mongodb');
var fs = require("fs");
var config = require("./config").config;

var db = new mongo.Db("local", new mongo.Server("127.0.0.1", 27017, {}));

var dbClient;

var withAlogDb = function(cb) {
    dbClient.collection("consumptions", function(err, consumptions) {
        if (err) {
            throw err;
        }
        cb(consumptions);
    });
};

db.open(function(err, client) {
    dbClient = client;
    withAlogDb(function(consumptions) {
        consumptions.ensureIndex({eid:1}, {unique:true}, function(err, index) {
        });
    });
});

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

var queryRange = function(from, to, response, cb) {
    queryByCriteria({date:{$gte: from, $lt: to}}, response, cb);
};

var queryAll = function(response, cb) {
    queryByCriteria({}, response, cb);
};

var queryByCriteria = function(criteria, response, cb) {
    withAlogDb(function(consumptions) {
        consumptions.find(criteria).toArray(function(err, docs) {
            if (!err) {
                cb(docs);
            } else {
                sendResponse(response, {ok: false, error: err});
            }
        });
    });
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

var sanitizeConsumption = function(newConsumption) {
    var consumption = {};
    consumption.eid = "" + newConsumption.eid;
    consumption.quantity = parseFloat("" + newConsumption.quantity);
    consumption.comment = (newConsumption.comment || "").trim();
    consumption.date = parseInt("" + newConsumption.date, 10);
    consumption.addTs = Math.floor(new Date().getTime() / 1000);
    return consumption;
};

var handleAdd = function(request, response) {
    form.onData(request, function(data) {
        if (checkAuthToken(data.token)) {
            console.log("add");
            withAlogDb(function(consumptions) {
                var newConsumptions = JSON.parse(data.consumptions);
                var from = parseInt(data.from, 10);
                var to = parseInt(data.to, 10);

                // FIXME: we should also validate the consumption and return an error if any is invalid
                var sanitizedConsumptions = [];
                for (var i = 0; i < newConsumptions.length; i++) {
                    sanitizedConsumptions.push(sanitizeConsumption(newConsumptions[i]));
                }
                var newEids = sanitizedConsumptions.map(function(consumption) {
                    return consumption.eid;
                });

                consumptions.insert(sanitizedConsumptions, {safe: true}, function(err, docs) {
                    if (!err) {
                        console.log("added", newEids.join(", "));
                        if (from && to) {
                            queryRange(from, to, response, function(docs) {
                                sendResponse(response, {ok: true, newEids: newEids, alkData: docs});
                            });
                        } else {
                            sendResponse(response, {ok: true, newEids: newEids});
                        }
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
            //TODO: to be implemented
            sendResponse(response, {ok: false});
        } else {
            sendError(response, 403, "ACCESS DENIED");
        }
    });
};

var handleDelete = function(request, response) {
    var reqUrl = url.parse(request.url, true);
    var eid = deleteRe.exec(reqUrl.pathname)[1];
    form.onData(request, function(data) {
        if (checkAuthToken(data.token)) {
            console.log("delete");
            withAlogDb(function(consumptions) {
                consumptions.remove({eid: eid}, function(err) {
                    if (!err) {
                        console.log("deleted", eid);
                        sendResponse(response, {ok: true});
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

var handleQuery = function(request, response) {
    var reqUrl = url.parse(request.url, true);
    if (checkAuthToken(reqUrl.query.token)) {
        var all = "true" === reqUrl.query.all;
        var from = parseInt(reqUrl.query.from, 10);
        var to = parseInt(reqUrl.query.to, 10);
        console.log("query");
        if (all) {
            queryAll(response, function(docs) {
                sendResponse(response, {ok: true, alkData: docs});
            });
        } else if (from && to) {
            queryRange(from, to, response, function(docs) {
                sendResponse(response, {ok: true, alkData: docs});
            });
        } else {
            sendError(response, 400, "BAD QUERY PARAMS");
        }
    } else {
        sendError(response, 403, "ACCESS DENIED");
    }
};

var staticRe = /^\/static\/([\w_\-\.]+)$/;
var alkRe = /^\/alk\/?$/;
var updateRe = /^\/alk\/([a-z0-9_]+)\/?$/;
var deleteRe = /^\/alk\/([a-z0-9_]+)\/del\/?$/;

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



