/*
 * NCF Referee App front end.
 *
 * Every page loads this file. It works out which page it is on, asks the
 * server who is logged in (refereeapp/me.php), and runs that page's code.
 * The server decides what each user may see: the browser only draws it.
 */

const serverURL = "refereeapp/";

// Pages anyone can open without logging in.
const PUBLIC_PAGES = ["index.html", "venueManagerForm.html", "nominationForm.html"];
// Pages only an admin can open.
const ADMIN_PAGES = ["admin.html", "refereeSchedule.html", "venueManagerSchedule.html", "payments.html",
                     "nominationFormData.html", "users.html"];

// ------------------------------------------------------------------ helpers

// Escape text before putting it into HTML, so a name like
// <script>...</script> shows as text instead of running.
function esc(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// POST to an endpoint. Returns a jQuery promise.
function api(file, data, dataType) {
    return $.ajax({ type: "POST", url: serverURL + file, data: data || {}, cache: false, dataType: dataType || "json" });
}

// Any request that comes back "not logged in" sends the user to the login page.
$(document).ajaxError(function (event, xhr) {
    if (xhr.status === 401 && currentPage() !== "index.html") {
        window.location.replace("index.html");
    }
});

function currentPage() {
    var name = window.location.pathname.split("/").pop();
    return name === "" ? "index.html" : name;
}

function errorText(xhr) {
    return (xhr && xhr.responseJSON && xhr.responseJSON.error) || "Something went wrong, please try again.";
}

// Display names, fetched once per username.
var nameCache = {};
function getUser(username) {
    if (!username) return $.Deferred().resolve("").promise();
    if (!nameCache[username]) nameCache[username] = api("getUsers.php", { username: username }, "text");
    return nameCache[username];
}

function getVenue(venue) {
    return { lyn: "Lyneham", gcr: "Gold Creek", rad: "Radford" }[venue] || venue;
}
var venueNameChange = getVenue;

function getDayFromIndex(index) {
    return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][index - 1];
}

function formatDate(date) {
    var d = new Date(date);
    return [d.getFullYear(), ("0" + (d.getMonth() + 1)).slice(-2), ("0" + d.getDate()).slice(-2)].join("-");
}

// Parse "YYYY-MM-DD" as a local date (new Date("YYYY-MM-DD") is UTC).
function parseDate(s) {
    var p = String(s).split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
}

function prettyDate(s) {
    return parseDate(s).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

function addDays(s, n) {
    var d = parseDate(s);
    d.setDate(d.getDate() + n);
    return formatDate(d);
}

// Monday and Sunday of the current week, as YYYY-MM-DD.
function getCurrentWeek(type) {
    var d = new Date();
    var monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    return type === "first" ? formatDate(monday) : addDays(formatDate(monday), 6);
}

// Next date (today included) that falls on dayOfWeek (0 = Sunday).
function getNextDayOfWeek(dayOfWeek) {
    var d = new Date();
    d.setDate(d.getDate() + (7 + Number(dayOfWeek) - d.getDay()) % 7);
    return formatDate(d);
}

// The Friday that availability is being collected for (strictly after today).
function availabilityFriday() {
    var d = new Date();
    d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
    return formatDate(d);
}

function firstDayOfCurrentMonth() {
    var d = new Date();
    return formatDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

function firstDayOfCurrentYear() {
    return formatDate(new Date(new Date().getFullYear(), 0, 1));
}

function hoursConvert(hours) {
    var map = { "08-9": "8AM-10AM", "10-11": "10AM-12PM", "12-13": "12PM-2PM", "14-15": "2PM-4PM",
                "16-17": "4PM-6PM", "18-19": "6PM-8PM", "20-21": "8PM-10PM" };
    return map[hours] || hours;
}

// Is a match starting at "HH:MM" inside an availability slot like "16-17" or "08-9"?
function slotCovers(slot, matchTime) {
    var parts = String(slot).split("-");
    var start = parseInt(parts[0], 10), end = parseInt(parts[1], 10);
    var hour = parseInt(String(matchTime).substring(0, 2), 10);
    return hour >= start && hour <= end;
}

function capitalizeFirstLetter(word) {
    return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

// Weeks for the admin week pickers (Fridays that have fixtures).
function loadWeekPicker(select, withAll) {
    return api("getFixtureWeeks.php").done(function (data) {
        select.empty();
        $.each(data.weeks, function (i, friday) {
            select.append($("<option>").val(friday).text(prettyDate(friday)));
        });
        if (withAll) select.append($("<option>").val("all").text("All"));
        select.val(data.current);
    });
}

// ------------------------------------------------------------------ start

$(document).ready(function () {
    var page = currentPage();
    if (PUBLIC_PAGES.indexOf(page) !== -1) {
        runPage(page, null);
        return;
    }
    api("me.php").done(function (me) {
        var adminPage = ADMIN_PAGES.indexOf(page) !== -1;
        if (adminPage !== (me.type === "admin")) {
            window.location.replace(me.type === "admin" ? "admin.html" : "homePage.html");
            return;
        }
        runPage(page, me);
    });
});

function runPage(page, me) {
    var username = me ? me.username : null;
    var userType = me ? me.type : null;

    if (me && me.type === "venuemanager") venueManagerPageLoad(document.title);
    if (me && me.type === "referee") refereePageLoad(document.title);

    switch (page) {
        case "index.html":
            // Opening the login page logs out. Wait for that before logging
            // in, or the logout could land after the login and undo it.
            var loggedOut = api("logout.php");
            api("demo.php").done(function (d) {
                if (!d.demo) return;
                var box = $('<div class="demoLogins"><b>Demo site.</b> Pick a login (password ' + esc(d.password) + '):</div>');
                $.each(d.logins, function (i, l) {
                    $('<button type="button">').text(l.role).on("click", function () {
                        $("#username").val(l.username);
                        $("#password").val(d.password);
                    }).appendTo(box);
                });
                $("form fieldset").prepend(box);
            });
            $("form").on("submit", function (e) {
                e.preventDefault();
                $("#incorPass").attr("hidden", true);
                loggedOut.always(function () { doLogin(); });
            });
            function doLogin() {
                api("connect.php", { username: $("#username").val(), password: $("#password").val() })
                    .done(function (data) {
                        if (data.success) window.location.replace(data.destination);
                        else $("#incorPass").removeAttr("hidden");
                    })
                    .fail(function () { $("#incorPass").text(" Could not reach the server.").removeAttr("hidden"); });
            }
            $(".toggle-password").click(function () {
                $(this).toggleClass("dark");
                var input = $($(this).attr("toggle"));
                input.attr("type", input.attr("type") === "password" ? "text" : "password");
            });
            break;

        case "admin.html":
            api("getComments.php").done(function (data) {
                $.each(data, function (key, value) {
                    $("#userComments h2").first().after(
                        '<div class="commentElement"><h3>' + esc(value.commentDate) + '</h3><p class="usernameSection">' +
                        esc(value.FirstName + " " + value.LastName) + '</p><p class="commentSection">' + esc(value.comments) + '</p></div>');
                });
            });
            GoogleChartDraw("userGraph");
            break;

        case "appointments.html":
            api("getAppointments.php").done(function (data) {
                if (!data.length) $("#appointmentsList").append("<li class='appointmentList'>No appointments this weekend.</li>");
                $.each(data, function (key, value) {
                    var rows = "<tr><td>Pitch: </td><td>" + esc(value.Court) + "</td></tr><tr><td>Age Group: </td><td>" + esc(value.AgeGroup) + "</td></tr>";
                    $.each(["referee1", "referee2", "referee3", "referee4", "coach"], function (i, slot) {
                        if (value[slot]) rows += "<tr><td>" + (slot === "coach" ? "Coach" : "Referee " + (i + 1)) + ": </td><td id='" + slot + key + "'></td></tr>";
                    });
                    $("#appointmentsList").append("<li class='appointmentList collapsible'><table class='appointmentTable'><tr class='topRow'><td>Date</td><td>Match Time</td><td>Venue</td></tr><tr><td>" +
                        esc(prettyDate(value.Date)) + "</td><td>" + esc(value.MatchTime) + "</td><td>" + esc(getVenue(value.Venue)) +
                        "</td></tr></table><div class='arrowHolder'><span class='arrow'></span></div><div class='content'><table class='appointmentTableMore'>" + rows + "</table></div></li>");
                    $.each(["referee1", "referee2", "referee3", "referee4", "coach"], function (i, slot) {
                        if (value[slot]) getUser(value[slot]).done(function (name) { $("#" + slot + key).html(name); });
                    });
                });
            });
            $(document).on("click", ".collapsible", function () { $(this).toggleClass("collapseActive"); });
            break;

        case "availability.html":
            var fri = availabilityFriday();
            $("#mainDiv h1").first().after("<p>For Friday " + esc(prettyDate(fri)) + " and Sunday " + esc(prettyDate(addDays(fri, 2))) + ".</p>");
            // Tick what this user already submitted for that weekend.
            api("getAvailability.php").done(function (data) {
                $.each(data, function (i, v) {
                    var day = v.date === fri ? "fri" : (v.date === addDays(fri, 2) ? "sun" : null);
                    if (!day) return;
                    var cell = $("#" + day + v.venue + v.hour);
                    if (cell.length && !cell.attr("hidden")) {
                        cell.addClass("highlighted").find("input").prop("checked", true);
                    }
                });
            });
            $("#submit").click(function () {
                var checkboxarray = $('input[name="checkboxarray[]"]:checked').map(function () { return $(this).val(); }).get();
                api("setAvailability.php", { checkboxarray: checkboxarray, comments: $("#comments").val() })
                    .done(function () { window.location.replace("homePage.html"); })
                    .fail(function (xhr) { alert(errorText(xhr)); });
            });
            var isMouseDown = false;
            $(".testingTable").on("mousedown", "td", function () {
                if (!$(this).find("input").length) return false;
                isMouseDown = true;
                var box = $(this).find("input");
                box.prop("checked", !box.prop("checked"));
                $(this).toggleClass("highlighted", box.prop("checked"));
                return false;
            }).on("mouseover", "td", function () {
                if (!isMouseDown || !$(this).find("input").length) return;
                var box = $(this).find("input");
                box.prop("checked", !box.prop("checked"));
                $(this).toggleClass("highlighted", box.prop("checked"));
            });
            $(document).mouseup(function () { isMouseDown = false; });
            break;

        case "changeDetails.html":
            $("#submit").click(function () {
                var fd = new FormData();
                var files = $("#image")[0].files;
                if (files.length) fd.append("file", files[0]);
                fd.append("firstName", $("#firstName").val());
                fd.append("lastName", $("#lastName").val());
                fd.append("dob", $("#dob").val());
                fd.append("bsb", $("#bsb").val());
                fd.append("accNum", $("#accNum").val());
                $.ajax({ url: serverURL + "changeDetails.php", type: "post", data: fd, contentType: false, processData: false })
                    .done(function (data) { alert(data); window.location.replace("profile.html"); })
                    .fail(function (xhr) { alert(errorText(xhr)); });
            });
            $("#passwordSubmit").click(function () {
                if ($("#newPassword").val() !== $("#newPassword2").val()) { alert("The new passwords don't match."); return; }
                api("changePassword.php", { current: $("#currentPassword").val(), new: $("#newPassword").val() })
                    .done(function () { alert("Password changed."); $("#passwordSet input").val(""); })
                    .fail(function (xhr) { alert(errorText(xhr)); });
            });
            break;

        case "homePage.html":
            getUser(username).done(function (name) { $(".usernameArea").html(name); });
            var weekendFri = availabilityFriday();
            $("#currAvailability h3").text("Availability for " + prettyDate(weekendFri) + " weekend");
            api("getAvailability.php").done(function (data) {
                $.each(data, function (key, value) {
                    var row = null;
                    if (value.date === weekendFri && value.venue === "lyn") row = "#lynfri";
                    else if (value.date === addDays(weekendFri, 2)) row = "#" + value.venue + "sun";
                    if (row) $(row).append("<td>" + esc(hoursConvert(value.hour)) + "</td>");
                });
            });
            break;

        case "nominationForm.html":
            for (var i = 0; i < 5; i++) AddNewPlayerToForm();
            $("#addNewPlayer").on("click", function () { AddNewPlayerToForm(); });
            $("form").submit(function (event) {
                event.preventDefault();
                var formData = {};
                $(this).find("input, select").each(function () {
                    if (this.name) formData[this.name] = $(this).val();
                });
                api("nominationForm.php", formData)
                    .done(function (data) { $("form").html($('<div class="alert alert-success">').text(data.message)); })
                    .fail(function (xhr) { alert(errorText(xhr)); });
            });
            break;

        case "nominationFormData.html":
            TeamsList();
            $(".btnMenu").append(' <button class="basicBtn checkReg">Check registrations</button>');
            api("getCompetitionNumbers.php", {}, "html").done(function (html) {
                $(".btnMenu").after('<div id="compNumbers"><h3>Teams per competition</h3>' + html + "</div>");
            });
            $("#nominationFormMain").on("keyup", ".searchBar", function () {
                var value = $(this).val().toLowerCase();
                $("#mainTable .entries").filter(function () {
                    $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1);
                });
            });
            $("#nominationFormMain").on("change", ".approve", function () {
                api("changeApproval.php", { data: $(this).data("id") + ($(this).prop("checked") ? "1" : "0") });
            });
            $("#nominationFormMain").on("click", "button", function () {
                var b = $(this);
                if (b.hasClass("playerClose")) {
                    if (!confirm("Remove this player from the team?")) return;
                    api("removeTeam.php", { data: b.data("id") }).done(function () { b.closest(".row").remove(); });
                }
                if (b.hasClass("backBtn")) TeamsList();
                if (b.hasClass("players")) PlayersList(b.data("id"));
                if (b.hasClass("allPlayers")) AllPlayers();
                if (b.hasClass("teams")) TeamsList();
                if (b.hasClass("staff")) StaffList();
                if (b.hasClass("checkReg")) {
                    api("updateReg.php").done(function () { alert("Registrations checked."); AllPlayers(); });
                }
            });
            $("#playerAmount").change(function () {
                var heading = $("#tableContainer").children("h1").text();
                if (heading === "Team Nominations") TeamsList();
                if (heading === "Players") AllPlayers();
                if (heading === "Staff") StaffList();
            });
            break;

        case "payments.html":
            loadWeekPicker($("#weekNum"), true);
            LoadPaymentContent("Dashboard");
            $("#paymentsMain").on("click", "#mainPaymentBtns button", function () {
                $("#mainPaymentBtns button").removeClass("buttonClicked");
                $(this).addClass("buttonClicked");
                LoadPaymentContent($(this).text());
            });
            $("#paymentsMain").on("click", "#subPaymentBtns button", function () {
                $("#subPaymentBtns button").removeClass("buttonClicked");
                $(this).addClass("buttonClicked");
                LoadCostFigures($(this).text());
            });
            $("#weekNum").change(function () {
                if ($("#mainPaymentBtns .buttonClicked").text() === "Referee List") LoadPaymentContent("Referee List");
            });
            break;

        case "profile.html":
            api("getUserDetails.php").done(function (data) {
                $.each(data, function (key, value) {
                    $("#profilePic").attr("src", value.profilePic);
                    $("#FirstName").text(value.FirstName);
                    $("#LastName").text(value.LastName);
                    $("#DOB").text(value.DOB || "");
                    $("#bsb").text(value.bsb || "");
                    $("#accNum").text(value.accNum || "");
                });
            });
            break;

        case "refereeSchedule.html":
            loadWeekPicker($("#weekNum")).done(LoadSchedule);
            $("#weekNum").change(LoadSchedule);
            $("#dayvenueBtns").children("button").on("click", function () {
                $("#dayvenueBtns button").removeClass("buttonClicked");
                $(this).addClass("buttonClicked");
                LoadSchedule();
            });
            $("#notifyBtn").prop("disabled", false).on("click", function () {
                if (!confirm("Email every referee appointed this weekend?")) return;
                api("notifyRefs.php", {}, "text").done(function (data) { alert(data); });
            });
            $("#submitBtn").on("click", function () {
                var temp = {};
                $("#scheduleDiv input").each(function () { temp[this.id] = $(this).val(); });
                api("setSchedule.php", { temp: temp }, "text").done(function (data) { alert(data); LoadSchedule(); });
            });
            $("#scheduleDiv").on("click", ".delMatch", function () {
                if (!confirm("Delete this match?")) return;
                api("deleteAppointment.php", { id: $(this).data("id") }).done(LoadSchedule);
            });
            $("#addMatchForm").on("submit", function (e) {
                e.preventDefault();
                api("addAppointment.php", $(this).serialize())
                    .done(function () { loadWeekPicker($("#weekNum")).done(LoadSchedule); })
                    .fail(function (xhr) { alert(errorText(xhr)); });
            });
            $("#importForm").on("submit", function (e) {
                e.preventDefault();
                $.ajax({ url: serverURL + "addAppointment.php", type: "post", data: new FormData(this), contentType: false, processData: false })
                    .done(function (d) { alert("Imported " + d.added + " matches."); loadWeekPicker($("#weekNum")).done(LoadSchedule); })
                    .fail(function (xhr) { alert(errorText(xhr)); });
            });
            break;

        case "shifts.html":
            api("getShifts.php", { firstDayOfWeek: getCurrentWeek("first"), lastDayOfWeek: addDays(getCurrentWeek("first"), 13) }).done(function (data) {
                if (!data.length) $("#appointmentsList").append("<li class='appointmentList'>No shifts in the next two weeks.</li>");
                $.each(data, function (key, value) {
                    $("#appointmentsList").append("<li class='appointmentList collapsible' data-id='" + Number(value.shiftID) + "'><table class='appointmentTable'><tr class='topRow'><td>Date</td><td>Time</td><td>Venue</td></tr><tr><td>" +
                        esc(prettyDate(value.date)) + "</td><td>" + esc(value[1] + " - " + value[2]) + "</td><td>" + esc(getVenue(value.venue)) +
                        "</td></tr></table><div class='confirm'><input type='checkbox' " + (value.confirmed == 1 ? "checked" : "") + "><span class='checkmark'></span></div></li>");
                });
            });
            $(document).on("click", ".collapsible", function () {
                var box = $(this).find(".confirm input");
                box.prop("checked", !box.prop("checked"));
                api("setShiftConfirmation.php", { id: $(this).data("id"), confirm: box.prop("checked") ? 1 : 0 });
            });
            break;

        case "users.html":
            LoadUsers();
            $("#addRefForm").on("submit", function (e) {
                e.preventDefault();
                api("addNewReferee.php", $(this).serialize())
                    .done(function (d) {
                        alert("Referee added. Their starting password is:\n\n" + d.password + "\n\nSend it to them privately; they can change it on their profile.");
                        $("#addRefForm")[0].reset();
                        LoadUsers();
                    })
                    .fail(function (xhr) { alert(errorText(xhr)); });
            });
            $("#usersMain").on("click", "button[data-action]", function () {
                var b = $(this), action = b.data("action");
                var data = { action: action, type: b.data("type"), username: b.data("user") };
                if (action === "delete" && !confirm("Delete " + data.username + " and their availability?")) return;
                if (action === "payRate") {
                    data.rate = prompt("Hourly pay rate in dollars:", b.data("rate") || "");
                    if (data.rate === null) return;
                }
                if (action === "reset" && !confirm("Give " + data.username + " a new password?")) return;
                api("manageUser.php", data)
                    .done(function (d) {
                        if (d.password) alert("New password for " + data.username + ":\n\n" + d.password + "\n\nSend it to them privately.");
                        LoadUsers();
                    })
                    .fail(function (xhr) { alert(errorText(xhr)); });
            });
            break;

        case "venueManagerForm.html":
            $("form").submit(function (event) {
                event.preventDefault();
                var formData = new FormData();
                $.each(["firstName", "lastName", "email", "dob", "street", "suburb", "postcode", "mobile", "wwvpNo", "wwvpEx",
                        "firstNameEC", "lastNameEC", "emailEC", "mobileEC", "accName", "accNum", "bsb"], function (i, f) {
                    formData.append(f, $("#" + f).val() || "");
                });
                formData.append("mobileAltEC", $("#altMobileEC").val() || "");
                var files = $("#firstAid")[0].files;
                if (files.length) formData.append("file", files[0]);
                $.ajax({ type: "POST", url: serverURL + "addNewVM.php", data: formData, contentType: false, processData: false, dataType: "json" })
                    .done(function (data) { $("form").html($('<div class="alert alert-success">').text(data.message)); })
                    .fail(function (xhr) { alert(errorText(xhr)); });
            });
            break;

        case "venueManagerSchedule.html":
            LoadVMContent("Schedule");
            $("#vmScheduleMain").on("click", "button", function () {
                var b = $(this);
                if (b.hasClass("close")) {
                    if (!confirm("Delete this shift?")) return;
                    api("deleteShift.php", { data: b.parent().attr("id") }).done(function () { b.parent().remove(); });
                }
                if (b.attr("id") === "newShift") LoadNewSubmission("userTable");
                else if (b.hasClass("submitShift")) {
                    var temp = {};
                    b.closest(".row").find("input, select").each(function () {
                        temp[this.name] = this.name === "day" ? getNextDayOfWeek($(this).val()) : $(this).val();
                    });
                    api("setShift.php", { temp: temp }, "text").done(function (data) {
                        alert(data);
                        if (data.indexOf("Successful") === 0) b.closest(".row").remove();
                    });
                }
            });
            $("#mainvmBtns").on("click", "button", function () {
                $(this).parent().children().removeAttr("class");
                $(this).toggleClass("buttonClicked");
                LoadVMContent($(this).text());
            });
            $("#vmScheduleMain").on("click", "#notifyBtn", function () {
                if (!confirm("Email every venue manager with a shift this weekend?")) return;
                api("notifyVMs.php", {}, "text").done(function (data) { alert(data); });
            });
            break;
    }
}

// ------------------------------------------------------------------ referee / VM pages

function venueManagerPageLoad(pageName) {
    $("#menuOption").append('<a href="shifts.html">Shifts</a>');
    $("#menuOptionHide").append('<a class="hide" href="shifts.html">Shifts</a>');

    if (pageName == "NCF Appointments")
        $("#introText").append('<p>Welcome to the North Canberra Futsal Venue Manager Portal. First, submit your availability.</p><p>You will then be given shifts based on your availability. The Shifts tab shows your shifts; tap a shift to confirm it.</p><p>Submit your availability at the start of every week.</p><p>Your profile page lets you change your details and password.</p>');
    else if (pageName == "Availability") {
        $("#lynehamFri").append("<td id='frilyn16-17'><input type='checkbox' name='checkboxarray[]' value='frilyn16-17'>4:15PM-10PM</td>");
        $("#lynehamSun").append("<td id='sunlyn08-9'><input type='checkbox' name='checkboxarray[]' value='sunlyn08-9'>8:15AM-1:45PM</td><td id='sunlyn14-15'><input type='checkbox' name='checkboxarray[]' value='sunlyn14-15'>1:30PM-7PM</td>");
        $("#goldcreekSun").append("<td id='sungcr08-9'><input type='checkbox' name='checkboxarray[]' value='sungcr08-9'>9AM-1:15PM</td><td id='sungcr12-13'><input type='checkbox' name='checkboxarray[]' value='sungcr12-13'>1PM-5PM</td>");
        $("#radfordSun").append("<td id='sunrad08-9'><input type='checkbox' name='checkboxarray[]' value='sunrad08-9'>9AM-1:15PM</td><td id='sunrad12-13'><input type='checkbox' name='checkboxarray[]' value='sunrad12-13'>1PM-5PM</td>");
    }
}

function refereePageLoad(pageName) {
    $("#menuOption").append('<a href="appointments.html">Appointments</a>');
    $("#menuOptionHide").append('<a class="hide" href="appointments.html">Appointments</a>');
    if (pageName == "NCF Appointments")
        $("#introText").append('<p>Welcome to the North Canberra Futsal Referee Portal. First, submit your availability.</p><p>You will then be appointed games. The Appointments tab shows your games for this weekend.</p><p>Submit your availability at the start of every week.</p><p>Your profile page lets you change your details and password.</p><p>Payments for games are processed every fortnight. Competitive games (U10-U20) are $25 per game. Non-competitive games (U8 and U9) are $20 per game.</p>');
    else if (pageName == "Availability") {
        var cell = function (code, label) {
            return "<td id='" + code + "'><input type='checkbox' name='checkboxarray[]' value='" + code + "'>" + label + "</td>";
        };
        $("#lynehamFri").append(cell("frilyn16-17", "5PM-6PM") + cell("frilyn18-19", "6PM-8PM") + cell("frilyn20-21", "8PM-9PM"));
        $.each({ lynehamSun: "lyn", radfordSun: "rad", goldcreekSun: "gcr" }, function (row, v) {
            $("#" + row).append(cell("sun" + v + "08-9", "8AM-10AM") + cell("sun" + v + "10-11", "10AM-12PM") + cell("sun" + v + "12-13", "12PM-2PM") +
                cell("sun" + v + "14-15", "2PM-4PM") + cell("sun" + v + "16-17", v === "lyn" ? "4PM-7PM" : "4PM-6PM"));
        });
    }
}

// ------------------------------------------------------------------ admin: referee schedule

function LoadSchedule() {
    var friday = $("#weekNum").val();
    if (!friday) return;
    var btn = $("#dayvenueBtns .buttonClicked").attr("id");
    var day = btn.substring(0, 3);
    var venue = btn.substring(3, 6);
    var date = day === "sun" ? addDays(friday, 2) : friday;
    $("#scheduleDiv").children().slice(5).remove();

    $.when(api("getSchedule.php", { friday: friday }), api("getAllAvailability.php"), api("getAllReferees.php"))
        .done(function (schedule, availability, referees) {
            var names = {};
            $.each(referees[0], function (i, r) { names[r.username] = r.FirstName + " " + r.LastName; });
            var matches = $.grep(schedule[0], function (m) { return m.Date === date && m.Venue === venue; });
            if (!matches.length) {
                $("#scheduleDiv").append("<p style='grid-column: 1 / -1'>No matches here this weekend. Add them below.</p>");
            }
            $.each(matches, function (key, m) {
                var options = "";
                $.each(availability[0], function (i, a) {
                    if (a.venue === venue && a.date === date && names[a.username] && slotCovers(a.hour, m.MatchTime)) {
                        options += "<option value='" + esc(names[a.username]) + "'></option>";
                    }
                });
                $("#scheduleDiv").append("<h3>Court " + esc(m.Court) + " <small>" + esc(m.AgeGroup) + "</small> <button class='delMatch' title='Delete match' data-id='" +
                    Number(m.appointID) + "'>&times;</button></h3><h3>" + esc(m.MatchTime) + "</h3>");
                $("#scheduleDiv").append("<datalist id='datalist" + key + "'>" + options + "</datalist>");
                $.each([1, 2, 3], function (i, slot) {
                    var current = m["referee" + slot];
                    $("#scheduleDiv").append($("<input>").attr({ id: slot + "" + m.appointID, list: "datalist" + key, placeholder: "Available referees..." })
                        .val(current ? (names[current] || current) : ""));
                });
            });
        });
}

// ------------------------------------------------------------------ admin: venue managers

function LoadVMContent(contentType) {
    $("#hiddenSection").nextAll().remove();
    switch (contentType) {
        case "Schedule":
            $("#hiddenSection").hide();
            $("#vmScheduleMain").append('<h1>Venue Manager Schedule</h1><div class="wrapper"><div class="table" id="userTable"><div class="row header green"><div class="cell">Day</div><div class="cell">Venue</div><div class="cell">Time Slot</div><div class="cell">VM</div><div class="cell">Confirmed</div></div></div></div>');
            api("getAllShifts.php", { firstDayOfWeek: getCurrentWeek("first"), lastDayOfWeek: addDays(getCurrentWeek("first"), 13) }).done(function (data) {
                $.each(data, function (key, value) {
                    $("#userTable").append('<div class="row" id="' + Number(value.shiftID) + '"><div class="cell">' + esc(getDayFromIndex(value[0]) + " " + prettyDate(value.date)) +
                        '</div><div class="cell">' + esc(getVenue(value[3])) + '</div><div class="cell">' + esc(value[1].substr(0, 5) + " - " + value[2].substr(0, 5)) +
                        '</div><div class="cell" id="special' + key + '"></div><div class="cell">' + (value.confirmed == 1 ? "Yes" : "No") + '</div><button class="close">&times;</button></div>');
                    getUser(value.venuemanagerID).done(function (name) { $("#special" + key).html(name); });
                });
            });
            $("#vmScheduleMain").append('<button id="notifyBtn">Notify Venue Managers</button>');
            break;
        case "Availability":
            $("#hiddenSection").show();
            $.each(["lynfriaft", "lynsunmor", "lynsunaft", "gcrsunmor", "gcrsunaft", "radsunmor", "radsunaft"], function (i, code) {
                api("getVMAvailability.php", { username: code }, "text").done(function (d) { $("#" + code).html(d); });
            });
            break;
        case "Shifts":
            $("#hiddenSection").hide();
            $("#vmScheduleMain").append('<h1>Submit Venue Manager Shifts</h1><div class="wrapper"><button id="newShift" class="smlBtn">Add New</button><div class="table" id="userTable"><div class="row header blue"><div class="cell">Name</div><div class="cell">Day</div><div class="cell">Venue</div><div class="cell">Start Time</div><div class="cell">Finish Time</div><div class="cell"></div></div></div></div>');
            break;
    }
}

function LoadNewSubmission(destination) {
    $("#" + destination).append('<div class="row"><div class="cell"><input type="text" name="name" placeholder="Full name"></div><div class="cell"><select name="day"><option value="5">Friday</option><option value="0">Sunday</option></select></div><div class="cell"><select name="venue"><option value="lyn">Lyneham</option><option value="gcr">Gold Creek</option><option value="rad">Radford</option></select></div><div class="cell"><input type="time" name="timeStart" value="09:30"></div><div class="cell"><input type="time" name="timeEnd" value="12:30"></div><div class="cell"><button class="submitShift">Submit</button></div></div>');
}

// ------------------------------------------------------------------ admin: payments

function LoadPaymentContent(contentType) {
    $("#mainPaymentBtns").nextAll("div").remove();
    switch (contentType) {
        case "Dashboard":
            $("#paymentsMain").append('<div id="topSection"><div class="timeCategoryBtns paymentsPagesBtns" id="subPaymentBtns"><button class="buttonClicked">Week</button><button>Month</button><button>Year</button></div><div id="costsPerUser"><div id="refereeCost"><h3>Referees</h3><h3 id="refTotalCost">$</h3></div><div id="vmsCost"><h3>VMs</h3><h3 id="vmTotalCost">$</h3></div><div><h3>Total Cost</h3><h3 id="totalCost">$</h3></div></div></div><div id="bottomSection"><div id="costsGraph"></div><div id="totalMembers"><h3>Total Users</h3><h3 id="totalMembersNum"></h3></div></div>');
            GoogleChartDraw("costsGraph");
            LoadCostFigures("Week");
            break;
        case "Referee List":
            $("#paymentsMain").append('<div class="wrapper"><h2 style="background-color: white;width:200px;cursor:pointer" onclick="exportTableToExcel(\'userTable\',\'refereePayments\')">Export</h2><div class="table" id="userTable"><div class="row header blue"><div class="cell">Name</div><div class="cell">BSB</div><div class="cell">Account</div><div class="cell">Games</div><div class="cell">Earnings</div></div></div></div>');
            var week = $("#weekNum").val();
            api("getAllReferees.php").done(function (data) {
                $.each(data, function (key, value) {
                    $("#userTable").append('<div class="row"><div class="cell">' + esc(value.FirstName + " " + value.LastName) + '</div><div class="cell">' + esc(value.BSB) +
                        '</div><div class="cell">' + esc(value.AccNum) + '</div><div class="cell" id="games' + key + '"></div><div class="cell" id="cost' + key + '"></div></div>');
                    api("getRefereePayment.php", { username: value.username, date: week === "all" ? "" : week }).done(function (rows) {
                        var total = 0;
                        $.each(rows, function (i, r) { total += parseInt(r.cost, 10); });
                        $("#games" + key).text(rows.length);
                        $("#cost" + key).text("$" + total);
                    });
                });
            });
            break;
        case "Venue Manager List":
            $("#paymentsMain").append('<div class="wrapper"><div class="table" id="userTable"><div class="row header blue"><div class="cell">Name</div><div class="cell">BSB</div><div class="cell">Account Number</div><div class="cell">Hours worked</div><div class="cell">Total Earnings</div></div></div></div>');
            api("getAllVMs.php").done(function (data) {
                $.each(data, function (key, value) {
                    $("#userTable").append('<div class="row"><div class="cell">' + esc(value.FirstName + " " + value.LastName) + '</div><div class="cell">' + esc(value.BSB) +
                        '</div><div class="cell">' + esc(value.AccNum) + '</div><div class="cell" id="hours' + key + '"></div><div class="cell" id="vmcost' + key + '"></div></div>');
                    api("getVMPayment.php", { username: value.username }).done(function (rows) {
                        var hours = 0;
                        $.each(rows, function (i, r) { hours += parseFloat(r.hours); });
                        $("#hours" + key).text(hours.toFixed(2));
                        $("#vmcost" + key).text("$" + (hours * parseFloat(value.payRate)).toFixed(2));
                    });
                });
            });
            break;
    }
}

function LoadCostFigures(lengthType) {
    var since = { Week: getCurrentWeek("first"), Month: firstDayOfCurrentMonth(), Year: firstDayOfCurrentYear() }[lengthType] || "1970-01-01";
    api("getAllUsers.php", {}, "text").done(function (d) { $("#totalMembersNum").text(d); });
    $.each({ refTotalCost: "ref", vmTotalCost: "vm", totalCost: "" }, function (id, which) {
        api("getAllHours.php", { username: which, dateRange: since }, "text").done(function (d) { $("#" + id).text(d); });
    });
}

// ------------------------------------------------------------------ admin: nominations

function rowLimit() {
    return parseInt($("#playerAmount").val(), 10) || 25;
}

function TeamsList() {
    $("#tableContainer").empty().append('<h1>Team Nominations</h1><div class="wrapper"><input class="searchBar" type="text" placeholder="Search.."><div class="table" id="mainTable"><div class="row header red"><div class="cell">Name</div><div class="cell">Age Group</div><div class="cell">Gender</div><div class="cell">Division</div><div class="cell">Player List</div><div class="cell">Approved</div></div></div></div>');
    api("getTeams.php", { username: "all" }).done(function (data) {
        $.each(data.slice(0, rowLimit()), function (key, value) {
            $("#mainTable").append('<div class="row entries"><div class="cell">' + esc(value.name) + '</div><div class="cell">' + esc(value.age) + '</div><div class="cell">' +
                esc(value.gender) + '</div><div class="cell">' + esc(value.division) + '</div><div class="cell"><button class="basicBtn sml players" data-id="' + Number(value.id) +
                '">Players (' + Number(value.players) + ')</button></div><div class="cell"><input type="checkbox" class="approve" data-id="' + Number(value.id) + '" ' +
                (value.approved == 1 ? "checked" : "") + '></div></div>');
        });
    });
}

function StaffList() {
    $("#tableContainer").empty().append('<h1>Staff</h1><div class="wrapper"><input class="searchBar" type="text" placeholder="Search.."><div class="table" id="mainTable"><div class="row header green"><div class="cell">Name</div><div class="cell">Email</div><div class="cell">Mobile</div><div class="cell">Type</div><div class="cell">Team</div></div></div></div>');
    api("getStaff.php").done(function (data) {
        $.each(data.slice(0, rowLimit()), function (key, value) {
            $("#mainTable").append('<div class="row entries"><div class="cell">' + esc(value.name) + '</div><div class="cell">' + esc(value.email) + '</div><div class="cell">' +
                esc(value.mobile) + '</div><div class="cell">' + esc(value.type) + '</div><div class="cell">' + esc(value.team) + '</div></div>');
        });
    });
}

function AllPlayers() {
    $("#tableContainer").empty().append('<h1>Players</h1><div class="wrapper"><input class="searchBar" type="text" placeholder="Search.."><div class="table" id="mainTable"><div class="row header blue"><div class="cell">FFA</div><div class="cell">First Name</div><div class="cell">Last Name</div><div class="cell">Date of Birth</div><div class="cell">Team</div><div class="cell">Registered</div></div></div></div>');
    api("getPlayers.php", { username: "all" }).done(function (data) {
        $.each(data.slice(0, rowLimit()), function (key, value) {
            $("#mainTable").append('<div class="row entries"><div class="cell">' + esc(value.ffa) + '</div><div class="cell">' + esc(value.firstName) + '</div><div class="cell">' +
                esc(value.lastName) + '</div><div class="cell">' + esc(value.dob) + '</div><div class="cell">' + esc(value.teamName || "(none)") +
                '</div><div class="cell"><input disabled type="checkbox" ' + (value.registered == 1 ? "checked" : "") + '></div></div>');
        });
    });
}

function PlayersList(id) {
    $("#tableContainer").empty().append('<button class="backBtn">&lt;</button><h1 id="teamName"></h1><div class="wrapper"><input class="searchBar" type="text" placeholder="Search.."><div class="table" id="mainTable"><div class="row header blue"><div class="cell">FFA</div><div class="cell">First Name</div><div class="cell">Last Name</div><div class="cell">Date of Birth</div><div class="cell"></div></div></div></div>');
    api("getPlayers.php", { username: id }).done(function (data) {
        if (data.length) $("#teamName").text(data[0].teamName);
        $.each(data, function (key, value) {
            $("#mainTable").append('<div class="row entries"><div class="cell">' + esc(value.ffa) + '</div><div class="cell">' + esc(value.firstName) + '</div><div class="cell">' +
                esc(value.lastName) + '</div><div class="cell">' + esc(value.dob) + '</div><div class="cell"><button class="playerClose" data-id="' + Number(value.id) + '">Remove</button></div></div>');
        });
    });
}

// ------------------------------------------------------------------ admin: users

function LoadUsers() {
    api("getUserList.php").done(function (data) {
        var table = $("#usersTable");
        table.children(".row").not(".header").remove();
        $.each(data, function (i, u) {
            var attrs = ' data-type="' + esc(u.type) + '" data-user="' + esc(u.username) + '"';
            var actions = '<button data-action="reset"' + attrs + '>' + (u.active == 1 ? "Reset password" : "Approve") + '</button>';
            if (u.type === "venuemanager") {
                actions += ' <button data-action="payRate" data-rate="' + esc(u.payRate) + '"' + attrs + '>Pay rate</button>';
                if (u.firstAid) actions += ' <a href="refereeapp/file.php?f=' + encodeURIComponent(u.firstAid) + '">First aid cert</a>';
            }
            actions += ' <button data-action="delete"' + attrs + '>Delete</button>';
            table.append('<div class="row"><div class="cell">' + esc(u.FirstName + " " + u.LastName) + '</div><div class="cell">' + esc(u.username) +
                '</div><div class="cell">' + (u.type === "referee" ? "Referee" : "Venue manager") + '</div><div class="cell">' +
                (u.active == 1 ? "Active" : "<b>Waiting for approval</b>") + (u.payRate != null ? " ($" + esc(u.payRate) + "/h)" : "") +
                '</div><div class="cell">' + actions + '</div></div>');
        });
    });
}

// ------------------------------------------------------------------ nomination form

function AddNewPlayerToForm() {
    var count = $("#playersFieldset").children("label").length + 1;
    if (count > 15) return;
    $('<label for="ffa' + count + '">Player ' + count + ':</label><br><input type="text" id="ffa' + count + '" name="ffa' + count + '" placeholder="FFA Number..."><input ' +
        (count <= 5 ? "required " : "") + 'type="text" id="firstName' + count + '" name="firstName' + count + '" placeholder="First Name..."><input ' +
        (count <= 5 ? "required " : "") + 'type="text" id="lastName' + count + '" name="lastName' + count + '" placeholder="Last Name..."><input type="date" id="dob' + count +
        '" name="dob' + count + '" title="Date of Birth"><br>').insertBefore("#addNewPlayer");
    if (count >= 15) $("#addNewPlayer").prop("disabled", true).css("visibility", "hidden");
}

// ------------------------------------------------------------------ charts and export

function GoogleChartDraw(id) {
    if (typeof google === "undefined") return;
    google.charts.load("current", { packages: ["corechart"] });
    google.charts.setOnLoadCallback(function () {
        api("getData.php").done(function (json) {
            var chart = new google.visualization.PieChart(document.getElementById(id));
            var draw = function () {
                chart.draw(new google.visualization.DataTable(json), { title: "Matches per venue", chartArea: { width: "94%" }, width: "99%" });
            };
            draw();
            var timer;
            $(window).off("resize.chart").on("resize.chart", function () { clearTimeout(timer); timer = setTimeout(draw, 500); });
        });
    });
}

function exportTableToExcel(tableID, filename) {
    var rows = [];
    $("#" + tableID + " .row").each(function () {
        rows.push($(this).children(".cell").map(function () {
            return '"' + $(this).text().replace(/"/g, '""') + '"';
        }).get().join(","));
    });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    link.download = (filename || "export") + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
}
