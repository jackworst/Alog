(function($) {
    // #### model code #################################################

    var serverAlkData = [];
    var serverAlkDataUnknown = false;
    var alkData = [];
    var allAlkData = false;
    
    var ts = function(date) {
        return Math.floor(date.getTime() / 1000);
    };

    var mkSlot = function(now, delta) {
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta, 12, 0, 0);
    };

    var slotStart = function(date) {
        return mkSlot(date, date.getHours() >= 12 ? 0 : -1);
    };

    var slotEnd = function(date) {
        return mkSlot(date, date.getHours() >= 12 ? 1 : 0);
    };

    var initAlkData = function(newServerAlkData) {
        serverAlkData = newServerAlkData || [];
        serverAlkDataUnknown = !newServerAlkData;
        var localAlkData = JSON.parse(localStorage.alkData || "[]");
        alkData = serverAlkData.concat(localAlkData);
        alkData.sort(function(a, b) {
            return a.date - b.date;
        });
    };

    var loadAlkData = function(loadAll, cb) {
        allAlkData = loadAll;
        var now = new Date();
        var rangeParams;
        if (allAlkData)  {
            rangeParams = {all : true};
        } else {
            rangeParams = {
                from: ts(slotStart(now)),
                to: ts(slotEnd(now))
            };
        }
        $.get("/alk", $.extend({token: localStorage.token}, rangeParams), function(response) {
            initAlkData(response.alkData);
            cb();
        }).error(function(jqXHR, textStatus) {
            initAlkData(undefined);
            cb();
        });
    };

    var consume = function(quantity) {
        var now = new Date();
        var consumption = {
            eid: ts(new Date()) + "_" + Math.floor(Math.random() * 1000000),
            quantity: quantity,
            date: ts(new Date()),
            syncPending: true
        };

        var localAlkData = JSON.parse(localStorage.alkData || "[]");
        localAlkData.push(consumption);
        localStorage.alkData = JSON.stringify(localAlkData);
        initAlkData(serverAlkDataUnknown ? undefined : serverAlkData);

        sync();
    };

    var sync = function() {
        var now = new Date();
        var consumptions = JSON.parse(localStorage.alkData || "[]");
        var data = {
            token: localStorage.token,
            from: ts(slotStart(now)),
            to: ts(slotEnd(now))
        };
        var todo = consumptions.length;
        busyConsuming($(".consumeBtns").children(":last"));
        if (todo > 0) {
            // sync pending: do sync (and thus implicitly refresh serverAlkData)
            $.each(consumptions, function(i, consumption) {
                $.post("/alk", $.extend({}, data, consumption), function(response) {
                    if (response.ok) {
                        var localAlkData = JSON.parse(localStorage.alkData || "[]");
                        localAlkData = $.map(localAlkData, function(cons) {
                            return cons.eid === consumption.eid ? null : cons;
                        });
                        localStorage.alkData = JSON.stringify(localAlkData);
                        initAlkData(response.alkData);
                    } else {
                        alert("error: " + JSON.stringify(response));
                        // or should we still remove the consumption in this case?
                    }
                    todo -= 1;
                    if (todo === 0) {
                        refresh();
                    }
                }).error(function(jqXHR, textStatus) {
                    todo -= 1;
                    if (todo === 0) {
                        refresh();
                    }
                });
            });
        } else {
            // no sync pending:just refresh serverAlkData
            loadAlkData(allAlkData, refresh);
        }
    };

    var deleteConsumption = function(eid) {
        // scan through consumptions, remove if local (sync-pending) only
        var wasSyncPending = false;
        $.each(alkData, function(i, consumption) {
            if (consumption.eid === eid && consumption.syncPending) {
                var localAlkData = JSON.parse(localStorage.alkData || "[]");
                localAlkData = $.map(localAlkData, function(cons) {
                    return cons.eid === eid ? null : cons;
                });
                localStorage.alkData = JSON.stringify(localAlkData);
                wasSyncPending = true;
            }
        });

        if (wasSyncPending) {
            // if we removed an unsynced consumption just re-init state
            initAlkData(serverAlkDataUnknown ? undefined : serverAlkData);
            refresh();
        } else {
            // if the consumption is on server, remove it there and refresh state from server
            $.post("/alk/" + encodeURIComponent(eid) + "/del", {token: localStorage.token}, function(response) {
                if (response.ok) {
                    loadAlkData(allAlkData, refresh);
                } else {
                    alert("error: " + JSON.stringify(response));
                }
            });
        }
    };
    
    var getTotalQuantity = function() {
        var total = 0;
        $.each(alkData, function(i, consumption) {
            total += consumption.quantity;
        });
        
        return total;
    };

    // #### view code ##################################################

    var handleAuthError = function(jqXHR, textStatus) {
        if (jqXHR.status === 403) {
            window.location = "/static/token.html";
        }
    };

    var mapQuantityToClass = function(quantity) {
        if (quantity <= 1.5) {
            return "ok";
        } else if (quantity <= 2) {
            return "warn1";
        } else if (quantity <= 2.5) {
            return "warn2";
        } else {
            return "critical";
        }
    };

    var busyConsuming = function(el) {
        var indicator = $('<img src="/static/ajax-loader.gif" class="busyConsuming"/>')
        el.after(indicator);
    };

    var renderConsumptions = function() {
        var consumptionsDiv = $('<div class="consumptions"/>');
    
        if (serverAlkDataUnknown) {
            var alkDiv = $('<div class="consumption">?</div>').addClass("unknown");
            consumptionsDiv.append(alkDiv);
        }

        var total = 0;
        var hasSyncPending = false;
        $.each(alkData, function(i, consumption) {
            total += consumption.quantity;
            var alkDiv = $('<div class="consumption"/>').addClass(mapQuantityToClass(total));
            if (consumption.syncPending) {
                alkDiv.addClass("unsynced");
                hasSyncPending = true;
            }
            alkDiv.text(consumption.quantity.toFixed(1));
            consumptionsDiv.append(alkDiv);
        });

        if (total > 0) {
            consumptionsDiv.append($('<div class="total"/>').text(" = " + total.toFixed(1)));
        }

        if (total <= 0 && !serverAlkDataUnknown) {
            var none = $('<div class="noConsumptions"/>').text("No consumptions today");
            consumptionsDiv.append(none);
        }

        var showSyncLink = serverAlkDataUnknown || hasSyncPending;
        var editArea = $('<div class="editArea"/>');
        editArea.append($('<a class="edit"  href="#"/>').text("edit"));
        if(showSyncLink) {
            editArea.append($('<a class="sync"  href="#"/>').text("retry"));
        }
        consumptionsDiv.append(editArea);
        
        return consumptionsDiv;
    };
    
    var renderConsumeBtns = function() {
        var total = getTotalQuantity();
        var btn05 = $('<div class="consumeBtn consume05"/>').text("0.5");
        btn05.addClass(mapQuantityToClass(total + 0.5));
        var btn03 = $('<div class="consumeBtn consume03"/>').text("0.3");
        btn03.addClass(mapQuantityToClass(total + 0.3));
        var btnAny = $('<div class="consumeBtn consumeAny"/>').text("...");
        btnAny.addClass(mapQuantityToClass(total + 0.5));
        var quantity = $('<input type="number" class="quantity any"/>').text("0.5").hide();
        var ok = $('<button class="okBtn any"/>').text("ok").hide();
        var cancel = $('<button class="cancelBtn any"/>').text("X").hide();
        var consumeBtns = $('<div class="consumeBtns"/>');
        consumeBtns.append(btn05).append(btn03).append(btnAny).append(quantity).append(ok).append(cancel);
        
        return consumeBtns;
    };
    
    var renderConsumeUI = function(container) {
        var mainDiv = $('<div class="main"/>');
        mainDiv.addClass(mapQuantityToClass(getTotalQuantity()));
        
        mainDiv.append(renderConsumptions()).append('<div class="clearDiv"/>');
        mainDiv.append(renderConsumeBtns()).append('<div class="clearDiv"/>');
        
        $(".consumeBtn.consume05", mainDiv).click(function() {
            consume(0.5);
            return false;
        });
        $(".consumeBtn.consume03", mainDiv).click(function() {
            consume(0.3);
            return false;
        });
        $(".consumeBtn.consumeAny", mainDiv).click(function() {
            var btns = $(this).closest(".consumeBtns");
            btns.addClass("modeAny");
            $(".consumeBtn", btns).hide();
            $(".any", btns).show();
            return false;
        });
        $(".consumeBtns .okBtn", mainDiv).click(function() {
            var btns = $(this).closest(".consumeBtns");
            consume(parseFloat($(".quantity" ,btns).val()));
            return false;
        });
        $(".consumeBtns .cancelBtn", mainDiv).click(function() {
            var btns = $(this).closest(".consumeBtns");
            btns.removeClass("modeAny");
            $(".consumeBtn", btns).show();
            $(".any", btns).hide();
            return false;
        });

        $(".consumptions .edit", mainDiv).click(function() {
            mode = "edit";
            refresh();
            return false;
        });
        $(".consumptions .sync", mainDiv).click(function() {
            sync();
        });
        
        $(container).empty().append(mainDiv);
    };

    var fmt2 = function(n) {
        return n < 10 ? "0" + n : "" + n;
    };

    var formatTime = function(date) {
        return fmt2(date.getHours()) + ":" + fmt2(date.getMinutes());
    };

    var weekDays = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    var formatDate = function(date) {
        return weekDays[date.getDay()] + " " + fmt2(date.getDate()) + "." + fmt2(date.getMonth() + 1) + "." + date.getFullYear();
    };

    var renderConsumptionsList = function() {
        //FIXME: use better css class names or differentiate over parent class
        var consumptionsDiv = $('<div/>');

        var consumptionsUl;
        var currentSlot;
        if (alkData.length > 0) {
            $.each(alkData.slice(0).reverse(), function(i, consumption) {
                var consumptionSlot = slotStart(new Date(consumption.date * 1000));
                if (!currentSlot || currentSlot.getTime() !== consumptionSlot.getTime()) {
                    currentSlot = consumptionSlot;
                    consumptionsDiv.append($('<p/>').text(formatDate(currentSlot)));
                    consumptionsUl = $('<ul class="consumptionsList"/>')
                    consumptionsDiv.append(consumptionsUl);
                }
                var alkLi = $('<li class="consumptionItem"/>');
                var label = formatTime(new Date(consumption.date * 1000)) + " - " + consumption.quantity.toFixed(1);
                alkLi.append($('<span class="label"/>').text(label));
                alkLi.append($('<span/>').text(" "));
                alkLi.append($('<a href="#" class="delete"/>').text("del").attr("data-eid", consumption.eid));
                if (consumption.syncPending) {
                    alkLi.addClass("unsynced");
                }
                consumptionsUl.append(alkLi);
            });
        } else if (!allAlkData) {
            consumptionsDiv.append($('<p/>').text("No consumptions today"));
        }
        var showHideText = allAlkData ? "show today" : "show all";
        var showHideAll = $('<p/>').append($('<a href="#" class="showHideAll"/>').text(showHideText));
        consumptionsDiv.append(showHideAll);
        
        return consumptionsDiv;
    };

    var renderEditUI = function(container) {
        var mainDiv = $('<div class="main"/>');
        
        mainDiv.append(renderConsumptionsList());
        mainDiv.append($('<div/>').append($('<a class="back" href="#"/>').text("back")));

        $(".back", mainDiv).click(function() {
            mode = "consume";
            if (allAlkData) {
                loadAlkData(false, refresh);
            } else {
                refresh();
            }
            return false;
        });

        $(".delete", mainDiv).click(function() {
            var eid = $(this).attr("data-eid");
            deleteConsumption(eid);
            return false;
        });

        $(".showHideAll", mainDiv).click(function() {
            loadAlkData(!allAlkData, refresh);
            return false;
        });
        
        $(container).empty().append(mainDiv);
    };
    
    var mode;

    var refresh = function() {
        if (mode === "consume") {
            renderConsumeUI($("#content"));
        } else if (mode === "edit") {
            renderEditUI($("#content"));
        }
    };
    
    $(document).ready(function() {
        $.ajaxSetup({
            error: handleAuthError
        });
        mode = "consume";
        loadAlkData(false, refresh);
    });
})(jQuery);


