/* token.js */

$(document).ready(function() {
    var isSet = Boolean(localStorage.token);
    $("#status").empty().append($('<p/>').addClass(isSet ? "success" : "failure").text("token currently set: " + (isSet ? "YES" : "NO")));
    $("#set").click(function() {
        try {
            localStorage.token = $.trim($("#token").val());
            $("#status").empty().append($('<p class="success"/>').text("token successfully set"));
        } catch (e) {
            $("#status").empty().append($('<p class="failure"/>').text("FAILED to set token"));
        }
        return false;
    });
});
