var form = require("./www-forms");

exports.onData = function(request, cb) {
    request.setEncoding("UTF-8");

    var data = "";
    request.on("data", function(chunk) {
        data += chunk;
    });
    request.on("end", function() {
        cb(form.decodeForm(data));
    });
};
