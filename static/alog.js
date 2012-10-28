(function($) {
    var alkData = [];
	
    var ts = function(date) {
        return Math.floor(date.getTime() / 1000);
    };

    var mkSlot = function(now, delta) {
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta, 12, 0, 0);
    };

    var loadAlkData = function(cb) {
        var now = new Date();
        $.get("/alk", {
                token: localStorage.token,
                from: ts(mkSlot(now, now.getHours() >= 12 ? 0 : -1)),
                to: ts(mkSlot(now, now.getHours() >= 12 ? 1 : 0))
            }, function(response) {
                alkData = response.alkData;
    		    cb();            
            }
        ).error(handleAuthError);
    };

	var consume = function(quantity) {
		var consumption = {
			eid: ts(new Date()) + "_" + Math.floor(Math.random() * 1000000),
			quantity: quantity,
			date: ts(new Date())
		};
        busyConsuming($(".consumeBtns").children(":last"));
        $.post("/alk", $.extend({token: localStorage.token}, consumption), function(response) {
            if (response.ok) {
        		loadAlkData(refresh);
            } else {
                alert("error: " + JSON.stringify(response));
            }
        }).error(handleAuthError);
	};
	
	var getTotalQuantity = function() {
		var total = 0;
		$.each(alkData, function(i, consumption) {
			total += consumption.quantity;
		});
		
		return total;
	};

    var handleAuthError = function(jqXHR, textStatus) {
        if (jqXHR.status === 403) {
            window.location = "/static/token.html";
        } else {
            alert(textStatus);
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
	
		var total = 0;
		$.each(alkData, function(i, consumption) {
			total += consumption.quantity;
			var alkDiv = $('<div class="consumption"/>').addClass(mapQuantityToClass(total));
			alkDiv.text(consumption.quantity.toFixed(1));
			consumptionsDiv.append(alkDiv);
		});

		if (total > 0) {
			consumptionsDiv.append($('<div class="total"/>').text(" = " + total.toFixed(1)));
            var editLink = $('<a class="edit"  href="#"/>').text("edit");
            consumptionsDiv.append($('<div class="editArea"/>').append(editLink));
		}
		
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
		
		$(container).empty().append(mainDiv);
	};

	var renderConsumptionsList = function() {
        //FIXME: use better css class names or differentiate over parent class
		var consumptionsUl = $('<ul class="consumptionsList"/>');

		$.each(alkData, function(i, consumption) {
			var alkLi = $('<li class="consumptionItem"/>');
            var label = new Date(consumption.date * 1000) + " " + consumption.quantity.toFixed(1);
			alkLi.append($('<span/>').text(label));
            alkLi.append($('<span/>').text(" "));
			alkLi.append($('<a href="#" class="delete"/>').text("del").attr("data-eid", consumption.eid));
			consumptionsUl.append(alkLi);
		});
		
		return consumptionsUl;
	};

	var renderEditUI = function(container) {
		var mainDiv = $('<div class="main"/>');
		
		mainDiv.append(renderConsumptionsList());
		mainDiv.append($('<div/>').append($('<a class="back" href="#"/>').text("back")));

        $(".back", mainDiv).click(function() {
            mode = "consume";
            refresh();
            return false;
        });

        $(".delete", mainDiv).click(function() {
            var eid = $(this).attr("data-eid");
            $.post("/alk/" + encodeURIComponent(eid) + "/del", {token: localStorage.token}, function(response) {
                if (response.ok) {
            		loadAlkData(refresh);
                } else {
                    alert("error: " + JSON.stringify(response));
                }
            }).error(handleAuthError);
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
        mode = "consume";
		loadAlkData(refresh);
	});
})(jQuery);
