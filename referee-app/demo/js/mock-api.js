/*
 * Simulated backend for the browser-only demo.
 *
 * The real app is PHP + MySQL (see the case study). On GitHub Pages there is
 * no server, so this file catches every AJAX call to refereeapp/*.php and
 * answers it from fake data kept in this browser's localStorage. The pages,
 * styles and js/index.js are the real front end, unchanged.
 *
 * Each handler mirrors the PHP endpoint of the same name: the same inputs,
 * the same outputs, the same role checks. Nothing leaves your browser and no
 * email is ever sent.
 */
(function () {
    "use strict";

    var STORE = "ncfDemoDb.v1";
    var SESSION = "ncfDemoSession.v1";
    var PASSWORD = "password123";

    // ------------------------------------------------------------ dates (local time, like the PHP server)

    function fmt(d) {
        return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    }
    function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
    function parse(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
    function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return fmt(d); }
    function monday() { var t = today(); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return fmt(t); }
    function thisFriday() { return addDays(monday(), 4); }
    function thisSunday() { return addDays(monday(), 6); }
    function availabilityFriday() { var t = today(); t.setDate(t.getDate() + ((5 - t.getDay() + 7) % 7 || 7)); return fmt(t); }
    function availabilitySunday() { return addDays(availabilityFriday(), 2); }
    function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || "") && fmt(parse(s)) === s; }
    function validTime(s) { return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s || ""); }
    function time12(t) {
        var h = parseInt(t.substr(0, 2), 10), m = t.substr(3, 2);
        return ((h + 11) % 12 + 1) + ":" + m + " " + (h < 12 ? "AM" : "PM");
    }
    function dayOfWeek(s) { return parse(s).getDay() + 1; } // MySQL DAYOFWEEK: 1 = Sunday

    // ------------------------------------------------------------ fake data (same as refereeapp/lib/seed.php)

    function seed() {
        var db = { admins: [], referees: [], venuemanagers: [], availability: [], appointments: [], shifts: [],
                   teams: [], players: [], staff: [], pfRegistrations: [], nextId: 1, seededOn: fmt(today()) };
        function id() { return db.nextId++; }
        db.admins.push({ username: "admin@example.test", FirstName: "Alex", LastName: "Admin" });
        [["Sam", "Lee"], ["Jordan", "Patel"], ["Riley", "Nguyen"], ["Casey", "Smith"], ["Morgan", "Brown"], ["Taylor", "Wilson"],
         ["Jamie", "Kaur"], ["Drew", "Martin"]].forEach(function (n, i) {
            db.referees.push({ username: "ref" + (i + 1) + "@example.test", active: true, FirstName: n[0], LastName: n[1],
                DOB: (2000 + i) + "-0" + ((i % 9) + 1) + "-15", bsb: "000000", accNum: "1234567" + i, profilePic: null, comments: "", commentDate: null });
        });
        [["Pat", "Walker", 32.5], ["Robin", "Hall", 30]].forEach(function (n, i) {
            db.venuemanagers.push({ username: "vm" + (i + 1) + "@example.test", active: true, FirstName: n[0], LastName: n[1], DOB: null,
                bsb: "000000", accNum: "7654321" + i, payRate: n[2], profilePic: null, comments: "", commentDate: null });
        });
        db.venuemanagers.push({ username: "vm3@example.test", active: false, FirstName: "Lou", LastName: "Applicant", payRate: 0, comments: "", commentDate: null });

        var ages = ["U8", "U10", "U12", "U14", "U16", "U18"];
        var weekends = [thisFriday(), addDays(thisFriday(), 7)];
        weekends.forEach(function (fri) {
            ["17:00", "18:00", "19:00"].forEach(function (t, ti) {
                [1, 2].forEach(function (court) {
                    db.appointments.push(match(id(), fri, t, "lyn", String(court), ages[(ti + court) % 6] + " Open"));
                });
            });
            ["lyn", "gcr", "rad"].forEach(function (v) {
                ["09:00", "10:00", "11:00"].forEach(function (t, ti) {
                    db.appointments.push(match(id(), addDays(fri, 2), t, v, "1", ages[ti + 2] + (ti % 2 ? " Girls" : " Open")));
                });
            });
        });
        db.appointments.filter(function (a) { return a.Date === thisFriday(); }).forEach(function (a, n) {
            a.referee1 = "ref" + (n % 4 + 1) + "@example.test";
            a.referee2 = "ref" + (n % 4 + 5) + "@example.test";
        });
        var af = availabilityFriday(), as = availabilitySunday();
        ["ref1", "ref2", "ref3"].forEach(function (r) {
            ["16-17", "18-19"].forEach(function (h) { db.availability.push({ username: r + "@example.test", date: af, hour: h, venue: "lyn" }); });
            db.availability.push({ username: r + "@example.test", date: as, hour: "08-9", venue: "gcr" });
        });
        ["16-17", "18-19", "20-21"].forEach(function (h) { db.availability.push({ username: "vm1@example.test", date: af, hour: h, venue: "lyn" }); });
        var ref2 = db.referees[1];
        ref2.comments = "Can only do early games this week.";
        ref2.commentDate = fmt(today());
        db.shifts.push({ shiftID: id(), date: thisFriday(), timeStart: "16:15:00", timeEnd: "22:00:00", venue: "lyn", venuemanagerID: "vm1@example.test", confirmed: 1 });
        db.shifts.push({ shiftID: id(), date: thisSunday(), timeStart: "08:15:00", timeEnd: "13:45:00", venue: "gcr", venuemanagerID: "vm2@example.test", confirmed: 0 });
        [["Northside Hornets", "U12", "open", "1"], ["Belconnen Comets", "U14", "girls", "2"]].forEach(function (t, k) {
            var tid = id();
            db.teams.push({ id: tid, name: t[0], age: t[1], gender: t[2], division: t[3], approved: k });
            db.staff.push({ id: id(), name: "Coach " + k, email: "coach" + k + "@example.test", mobile: "0400000003", type: "coach", team: tid, registered: 0 });
            for (var p = 1; p <= 6; p++) {
                db.players.push({ id: id(), ffa: String(100000 + k * 10 + p), firstName: "Player" + p, lastName: "Team" + k, dob: "2013-05-0" + p, team: tid, registered: 0 });
            }
        });
        db.pfRegistrations = [{ ffa: "100001", firstName: "Player1", lastName: "Team0" }, { ffa: "", firstName: "Player2", lastName: "Team0" }];
        return db;
    }

    function match(id, date, time, venue, court, age) {
        return { appointID: id, Date: date, MatchTime: time + ":00", Venue: venue, Court: court, AgeGroup: age,
                 referee1: null, referee2: null, referee3: null, referee4: null, coach: null };
    }

    // Generated columns in the real schema.
    function cost(a) { return parseInt(String(a.AgeGroup).substr(1, 2), 10) >= 10 ? 25 : 20; }
    function hours(s) {
        var a = s.timeStart.split(":"), b = s.timeEnd.split(":");
        return ((+b[0] * 60 + +b[1]) - (+a[0] * 60 + +a[1])) / 60;
    }

    // ------------------------------------------------------------ storage

    var memory = null;
    function load() {
        if (memory) return memory;
        try { memory = JSON.parse(localStorage.getItem(STORE)); } catch (e) { memory = null; }
        // Like the real demo: fresh data every day, so the dates stay current.
        if (!memory || memory.seededOn !== fmt(today())) { memory = seed(); save(); }
        return memory;
    }
    function save() { try { localStorage.setItem(STORE, JSON.stringify(memory)); } catch (e) { /* private mode: keep in memory */ } }
    function session() { try { return JSON.parse(sessionStorage.getItem(SESSION)); } catch (e) { return null; } }
    function setSession(s) { try { s ? sessionStorage.setItem(SESSION, JSON.stringify(s)) : sessionStorage.removeItem(SESSION); } catch (e) { } }
    window.ncfDemoReset = function () { memory = seed(); save(); setSession(null); };

    // ------------------------------------------------------------ request plumbing

    function Reply(status, body, type) { this.status = status; this.body = body; this.type = type; }
    function json(data, status) { return new Reply(status || 200, JSON.stringify(data), "application/json"); }
    function text(s, status) { return new Reply(status || 200, String(s), "text/plain"); }
    function html(s) { return new Reply(200, String(s), "text/html"); }
    function fail(msg, status) { throw json({ success: false, error: msg }, status || 400); }
    function h(s) {
        return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
    function clean(s, max) { return String(s || "").replace(/<[^>]*>/g, "").trim().substr(0, max || 255); }

    function requireLogin(types) {
        var s = session();
        if (!s) fail("Please log in.", 401);
        if (types && types.indexOf(s.type) === -1) fail("Not allowed.", 403);
        return s;
    }
    function requireAdmin() { return requireLogin(["admin"]); }

    // Turns "a=1&b[]=2&t[x]=3" into { a: "1", b: ["2"], t: { x: "3" } }, like PHP's $_POST.
    function parseForm(str) {
        var out = {};
        if (!str) return out;
        String(str).split("&").forEach(function (pair) {
            if (!pair) return;
            var i = pair.indexOf("=");
            var key = decodeURIComponent((i < 0 ? pair : pair.slice(0, i)).replace(/\+/g, " "));
            var val = decodeURIComponent((i < 0 ? "" : pair.slice(i + 1)).replace(/\+/g, " "));
            var m = key.match(/^([^\[]+)\[([^\]]*)\]$/);
            if (!m) { out[key] = val; return; }
            if (m[2] === "") { (out[m[1]] = out[m[1]] || []).push(val); return; }
            (out[m[1]] = out[m[1]] || {})[m[2]] = val;
        });
        return out;
    }

    function userTable(db, type) { return type === "referee" ? db.referees : type === "venuemanager" ? db.venuemanagers : db.admins; }
    function findUser(db, username) {
        var all = [["admin", db.admins], ["referee", db.referees], ["venuemanager", db.venuemanagers]];
        for (var i = 0; i < all.length; i++) {
            var u = all[i][1].filter(function (r) { return r.username === username; })[0];
            if (u) return { type: all[i][0], row: u };
        }
        return null;
    }
    function fullName(u) { return (u.FirstName + " " + u.LastName).trim(); }
    function slots(a) { return [a.referee1, a.referee2, a.referee3, a.referee4, a.coach]; }
    function onMatch(a, u) { return slots(a).indexOf(u) !== -1; }
    function sortBy(arr, fn) { return arr.slice().sort(function (x, y) { var a = fn(x), b = fn(y); return a < b ? -1 : a > b ? 1 : 0; }); }
    function both(arr, named) { // emulate PDO::FETCH_BOTH
        var o = {};
        arr.forEach(function (v, i) { o[i] = v; o[named[i]] = v; });
        return o;
    }
    function randomPassword() {
        var c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789", s = "";
        for (var i = 0; i < 12; i++) s += c[Math.floor(Math.random() * c.length)];
        return s;
    }
    function readFile(file) {
        return new Promise(function (resolve, reject) {
            var r = new FileReader();
            r.onload = function () { resolve(r.result); };
            r.onerror = reject;
            if (/^image\//.test(file.type)) r.readAsDataURL(file); else r.readAsText(file);
        });
    }

    // ------------------------------------------------------------ endpoints

    var VENUES = { lyn: "Lyneham", gcr: "Gold Creek", rad: "Radford" };
    var api = {};

    api["demo.php"] = function () {
        return json({ demo: true, simulated: true, password: PASSWORD, logins: [
            { role: "Admin", username: "admin@example.test" },
            { role: "Referee", username: "ref1@example.test" },
            { role: "Venue manager", username: "vm1@example.test" }] });
    };

    api["connect.php"] = function (db, p) {
        var u = findUser(db, String(p.username || "").toLowerCase());
        if (!u || u.row.active === false || p.password !== (u.row.password || PASSWORD)) return json({ success: false });
        setSession({ username: u.row.username, type: u.type });
        return json({ success: true, userType: u.type, username: u.row.username, destination: u.type === "admin" ? "admin.html" : "homePage.html" });
    };
    api["logout.php"] = function () { setSession(null); return json({ success: true }); };
    api["me.php"] = function () { return json(requireLogin()); };

    api["getUsers.php"] = function (db, p) {
        requireLogin();
        var u = findUser(db, p.username || "");
        return text(u ? h(fullName(u.row)) : "");
    };

    api["getUserDetails.php"] = function (db) {
        var s = requireLogin(["referee", "venuemanager"]);
        var u = findUser(db, s.username).row;
        return json([{ FirstName: u.FirstName, LastName: u.LastName, username: u.username, DOB: u.DOB, bsb: u.bsb, accNum: u.accNum,
                       profilePic: u.profilePic || "uploads/avatar.png" }]);
    };

    api["changeDetails.php"] = function (db, p, files) {
        var s = requireLogin(["referee", "venuemanager"]);
        var u = findUser(db, s.username).row, n = 0;
        if (clean(p.firstName)) { u.FirstName = clean(p.firstName, 100); n++; }
        if (clean(p.lastName)) { u.LastName = clean(p.lastName, 100); n++; }
        if (p.dob) { if (!validDate(p.dob)) return text("Date of birth must be a valid date."); u.DOB = p.dob; n++; }
        var bsb = String(p.bsb || "").replace(/\D/g, ""), acc = String(p.accNum || "").replace(/\D/g, "");
        if (bsb) { if (bsb.length !== 6) return text("BSB must be 6 digits."); u.bsb = bsb; n++; }
        if (acc) { if (acc.length < 6 || acc.length > 10) return text("Account number must be 6 to 10 digits."); u.accNum = acc; n++; }
        if (files.file) {
            if (!/^image\/(jpeg|png|gif)$/.test(files.file.type)) return text("That file type is not allowed.");
            return readFile(files.file).then(function (dataUrl) { u.profilePic = dataUrl; return text("Changes made successfully."); });
        }
        return text(n ? "Changes made successfully." : "Nothing to change.");
    };

    api["changePassword.php"] = function () {
        requireLogin();
        fail("Changing passwords is turned off on the demo site.", 403);
    };

    api["getAvailability.php"] = function (db, p) {
        var s = requireLogin();
        var who = s.type === "admin" && p.username ? p.username : s.username, from = addDays(fmt(today()), -7);
        return json(sortBy(db.availability.filter(function (a) { return a.username === who && a.date >= from; }), function (a) { return a.date + a.hour; })
            .map(function (a) { return { date: a.date, hour: a.hour, venue: a.venue }; }));
    };

    var HOURS = ["08-9", "10-11", "12-13", "14-15", "16-17", "18-19", "20-21"];
    var VM_BLOCKS = { "frilyn16-17": ["16-17", "18-19", "20-21"], "sunlyn08-9": ["08-9", "10-11", "12-13"], "sunlyn14-15": ["14-15", "16-17", "18-19"],
        "sungcr08-9": ["08-9", "10-11", "12-13"], "sungcr12-13": ["12-13", "14-15", "16-17"], "sunrad08-9": ["08-9", "10-11", "12-13"], "sunrad12-13": ["12-13", "14-15", "16-17"] };

    api["setAvailability.php"] = function (db, p) {
        var s = requireLogin(["referee", "venuemanager"]);
        var fri = availabilityFriday(), sun = availabilitySunday(), rows = [];
        (p.checkboxarray || []).forEach(function (code) {
            var m = String(code).match(/^(fri|sun)(lyn|gcr|rad)(.+)$/);
            if (!m) return;
            var date = m[1] === "fri" ? fri : sun;
            if (s.type === "venuemanager") (VM_BLOCKS[code] || []).forEach(function (hr) { rows.push([date, hr, m[2]]); });
            else if (HOURS.indexOf(m[3]) !== -1) {
                rows.push([date, m[3], m[2]]);
                if (m[1] === "sun" && m[2] === "lyn" && m[3] === "16-17") rows.push([date, "18-19", "lyn"]);
            }
        });
        db.availability = db.availability.filter(function (a) { return !(a.username === s.username && (a.date === fri || a.date === sun)); });
        var seen = {};
        rows.forEach(function (r) {
            if (seen[r.join()]) return;
            seen[r.join()] = 1;
            db.availability.push({ username: s.username, date: r[0], hour: r[1], venue: r[2] });
        });
        var c = clean(p.comments, 1000);
        if (c) { var u = findUser(db, s.username).row; u.comments = c; u.commentDate = fmt(today()); }
        return json({ success: true, saved: Object.keys(seen).length, friday: fri, sunday: sun });
    };

    api["getAppointments.php"] = function (db) {
        var s = requireLogin(["referee"]);
        var list = db.appointments.filter(function (a) { return a.Date >= thisFriday() && a.Date <= thisSunday() && onMatch(a, s.username); });
        return json(sortBy(list, function (a) { return a.Date + a.MatchTime + a.Court; }).map(function (a) {
            return both([a.Date, time12(a.MatchTime), a.Venue, a.Court, a.AgeGroup, a.referee1, a.referee2, a.referee3, a.referee4, a.coach],
                ["Date", "MatchTime", "Venue", "Court", "AgeGroup", "referee1", "referee2", "referee3", "referee4", "coach"]);
        }));
    };

    api["getShifts.php"] = function (db, p) {
        var s = requireLogin(["venuemanager"]);
        if (!validDate(p.firstDayOfWeek) || !validDate(p.lastDayOfWeek)) fail("Bad dates.");
        var list = db.shifts.filter(function (x) { return x.venuemanagerID === s.username && x.date >= p.firstDayOfWeek && x.date <= p.lastDayOfWeek; });
        return json(sortBy(list, function (x) { return x.date + x.timeStart; }).map(function (x) {
            return both([x.date, time12(x.timeStart), time12(x.timeEnd), x.venue, x.shiftID, x.confirmed], ["date", "timeStart", "timeEnd", "venue", "shiftID", "confirmed"]);
        }));
    };
    api["checkShift.php"] = function (db, p) {
        var s = requireLogin(["venuemanager"]);
        var x = db.shifts.filter(function (r) { return r.shiftID == p.id && r.venuemanagerID === s.username; })[0];
        return text(x ? x.confirmed : 0);
    };
    api["setShiftConfirmation.php"] = function (db, p) {
        var s = requireLogin(["venuemanager"]);
        db.shifts.forEach(function (r) { if (r.shiftID == p.id && r.venuemanagerID === s.username) r.confirmed = p.confirm === "1" ? 1 : 0; });
        return json({ success: true });
    };

    // --- admin
    api["getAllAvailability.php"] = function (db) {
        requireAdmin();
        var from = addDays(fmt(today()), -14);
        return json(sortBy(db.availability.filter(function (a) { return a.date >= from; }), function (a) { return a.date + a.hour; }));
    };
    api["getAllReferees.php"] = function (db) {
        requireAdmin();
        return json(sortBy(db.referees, fullName).map(function (r) { return { FirstName: r.FirstName, LastName: r.LastName, BSB: r.bsb, AccNum: r.accNum, username: r.username }; }));
    };
    api["getAllVMs.php"] = function (db) {
        requireAdmin();
        return json(sortBy(db.venuemanagers.filter(function (v) { return v.active; }), fullName)
            .map(function (v) { return { username: v.username, FirstName: v.FirstName, LastName: v.LastName, BSB: v.bsb, AccNum: v.accNum, payRate: v.payRate }; }));
    };
    api["getAllUsers.php"] = function (db) {
        requireAdmin();
        return text(db.referees.filter(function (r) { return r.active; }).length + db.venuemanagers.filter(function (v) { return v.active; }).length);
    };
    api["getAllHours.php"] = function (db, p) {
        requireAdmin();
        var since = validDate(p.dateRange) ? p.dateRange : "1970-01-01", total = 0;
        if (p.username !== "vm") db.appointments.forEach(function (a) {
            if (a.Date >= since) total += cost(a) * slots(a).filter(Boolean).length;
        });
        if (p.username !== "ref") db.shifts.forEach(function (x) {
            var v = db.venuemanagers.filter(function (m) { return m.username === x.venuemanagerID; })[0];
            if (v && x.date >= since) total += hours(x) * v.payRate;
        });
        return text("$" + total.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    };
    api["getRefereePayment.php"] = function (db, p) {
        requireAdmin();
        return json(db.appointments.filter(function (a) {
            return onMatch(a, p.username) && (!validDate(p.date) || (a.Date >= p.date && a.Date <= addDays(p.date, 2)));
        }).map(function (a) { return { cost: cost(a) }; }));
    };
    api["getVMPayment.php"] = function (db, p) {
        requireAdmin();
        return json(db.shifts.filter(function (x) { return x.venuemanagerID === p.username; }).map(function (x) { return { hours: hours(x).toFixed(2) }; }));
    };
    api["getComments.php"] = function (db) {
        requireAdmin();
        var all = db.referees.concat(db.venuemanagers).filter(function (u) { return u.commentDate && u.comments; });
        return json(sortBy(all, function (u) { return u.commentDate; }).reverse().slice(0, 20)
            .map(function (u) { return { FirstName: u.FirstName, LastName: u.LastName, comments: u.comments, commentDate: u.commentDate }; }));
    };
    api["getData.php"] = function (db) {
        requireAdmin();
        var counts = {};
        db.appointments.forEach(function (a) { counts[a.Venue] = (counts[a.Venue] || 0) + 1; });
        return json({ cols: [{ label: "Venue", type: "string" }, { label: "Matches", type: "number" }],
            rows: Object.keys(counts).sort().map(function (v) { return { c: [{ v: VENUES[v] || v }, { v: counts[v] }] }; }) });
    };
    api["getSchedule.php"] = function (db, p) {
        requireAdmin();
        var list = db.appointments.filter(function (a) { return !validDate(p.friday) || (a.Date >= p.friday && a.Date <= addDays(p.friday, 2)); });
        return json(sortBy(list, function (a) { return a.Date + a.MatchTime + a.Court; }).map(function (a) {
            var o = Object.assign({}, a);
            o.MatchTime = a.MatchTime.substr(0, 5);
            o.cost = cost(a);
            return o;
        }));
    };
    api["getFixtureWeeks.php"] = function (db) {
        requireAdmin();
        var weeks = {};
        db.appointments.forEach(function (a) { var d = parse(a.Date); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 4); weeks[fmt(d)] = 1; });
        weeks[thisFriday()] = 1;
        weeks[availabilityFriday()] = 1;
        return json({ weeks: Object.keys(weeks).sort(), current: thisFriday() });
    };
    api["setSchedule.php"] = function (db, p) {
        requireAdmin();
        var cols = { 1: "referee1", 2: "referee2", 3: "referee3", 4: "referee4", 5: "coach" }, updates = [], errors = [];
        Object.keys(p.temp || {}).forEach(function (key) {
            var slot = key.charAt(0), id = key.slice(1), name = String(p.temp[key]).trim();
            if (!cols[slot] || !/^\d+$/.test(id)) return;
            if (!name) { updates.push([cols[slot], null, +id]); return; }
            var m = db.referees.filter(function (r) { return fullName(r) === name; });
            if (m.length !== 1) m = db.referees.filter(function (r) { return r.username === name; });
            if (m.length === 1) updates.push([cols[slot], m[0].username, +id]); else errors.push(name);
        });
        if (errors.length) return text("Nothing saved. Could not find exactly one referee called: " + h(errors.join(", ")));
        updates.forEach(function (u) { db.appointments.forEach(function (a) { if (a.appointID === u[2]) a[u[0]] = u[1]; }); });
        return text("Schedule saved.");
    };

    function addMatch(db, m, line) {
        var where = line ? "Line " + line + ": " : "";
        var date = (m[0] || "").trim(), time = (m[1] || "").trim(), venue = (m[2] || "").trim().toLowerCase(), court = (m[3] || "").trim(), age = (m[4] || "").trim();
        if (!validDate(date)) return where + "date must look like 2026-11-20.";
        if (!validTime(time)) return where + "time must look like 17:00.";
        if (!VENUES[venue]) return where + "venue must be lyn, gcr or rad.";
        if (!/^U\d{1,2}\b/i.test(age)) return where + "age group must start like U12.";
        db.appointments.push(match(db.nextId++, date, time.substr(0, 5), venue, clean(court || "1", 20), "U" + clean(age.slice(1), 24)));
        return null;
    }
    api["addAppointment.php"] = function (db, p, files) {
        requireAdmin();
        if (files.csv) {
            return readFile(files.csv).then(function (csv) {
                var copy = JSON.parse(JSON.stringify(db)), added = 0, err = null;
                csv.split(/\r?\n/).some(function (line, i) {
                    if (i === 0 && /^\s*date\b/i.test(line)) return false;
                    if (!line.trim()) return false;
                    err = addMatch(copy, line.split(","), i + 1);
                    if (!err) added++;
                    return !!err;
                });
                if (err) fail("Nothing imported. " + err);
                Object.assign(db, copy);
                return json({ success: true, added: added });
            });
        }
        var e = addMatch(db, [p.date, p.time, p.venue, p.court, p.ageGroup]);
        if (e) fail(e);
        return json({ success: true, added: 1 });
    };
    api["deleteAppointment.php"] = function (db, p) {
        requireAdmin();
        db.appointments = db.appointments.filter(function (a) { return a.appointID != p.id; });
        return json({ success: true });
    };

    api["getAllShifts.php"] = function (db, p) {
        requireAdmin();
        if (!validDate(p.firstDayOfWeek) || !validDate(p.lastDayOfWeek)) fail("Bad dates.");
        var list = db.shifts.filter(function (x) { return x.date >= p.firstDayOfWeek && x.date <= p.lastDayOfWeek; });
        return json(sortBy(list, function (x) { return x.date + x.venue + x.timeStart; }).map(function (x) {
            return both([dayOfWeek(x.date), x.timeStart, x.timeEnd, x.venue, x.venuemanagerID, x.shiftID, x.confirmed, x.date],
                ["DAYOFWEEK(date)", "timeStart", "timeEnd", "venue", "venuemanagerID", "shiftID", "confirmed", "date"]);
        }));
    };
    api["setShift.php"] = function (db, p) {
        requireAdmin();
        var t = p.temp || {}, name = String(t.name || "").trim();
        if (!name) return text("Empty name field, please try again.");
        if (!validDate(t.day) || !validTime(t.timeStart) || !validTime(t.timeEnd) || !VENUES[t.venue]) return text("Check the day, venue and times.");
        if (t.timeEnd <= t.timeStart) return text("Finish time must be after start time.");
        var found = db.venuemanagers.filter(function (v) { return v.active && fullName(v).toLowerCase().indexOf(name.toLowerCase()) !== -1; });
        if (!found.length) return text("Couldn't find that venue manager, check name and try again.");
        if (found.length > 1) return text("Too many results for that name, please try a more specific name.");
        db.shifts.push({ shiftID: db.nextId++, date: t.day, timeStart: t.timeStart + ":00", timeEnd: t.timeEnd + ":00", venue: t.venue, venuemanagerID: found[0].username, confirmed: 0 });
        return text("Successful submission");
    };
    api["deleteShift.php"] = function (db, p) {
        requireAdmin();
        db.shifts = db.shifts.filter(function (x) { return x.shiftID != p.data; });
        return json({ success: true });
    };
    api["getVMAvailability.php"] = function (db, p) {
        requireAdmin();
        var m = String(p.username || "").match(/^(lyn|gcr|rad)(fri|sun)(mor|aft)$/);
        if (!m) return text("");
        var date = m[2] === "fri" ? availabilityFriday() : availabilitySunday(), hour = m[3] === "mor" ? "08-9" : "16-17";
        return text(db.availability.filter(function (a) { return a.date === date && a.venue === m[1] && a.hour === hour; })
            .map(function (a) { return db.venuemanagers.filter(function (v) { return v.username === a.username; })[0]; })
            .filter(Boolean).map(function (v) { return " | " + h(fullName(v)); }).join(""));
    };
    api["notifyRefs.php"] = function (db) {
        requireAdmin();
        var who = {};
        db.appointments.forEach(function (a) { if (a.Date >= thisFriday() && a.Date <= thisSunday()) slots(a).forEach(function (u) { if (u) who[u] = 1; }); });
        var n = Object.keys(who).length;
        return text(n ? "Emailed " + n + " referees. (Simulated: the demo never sends email.)" : "Nobody is appointed this weekend.");
    };
    api["notifyVMs.php"] = function (db) {
        requireAdmin();
        var who = {};
        db.shifts.forEach(function (x) { if (x.date >= thisFriday() && x.date <= thisSunday()) who[x.venuemanagerID] = 1; });
        var n = Object.keys(who).length;
        return text(n ? "Emailed " + n + " venue managers. (Simulated: the demo never sends email.)" : "No shifts this weekend.");
    };

    // --- public forms
    api["addNewVM.php"] = function (db, p, files) {
        var email = String(p.email || "").trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) fail("Please enter a valid email address.");
        if (!clean(p.firstName) || !clean(p.lastName)) fail("Please enter your name.");
        if (findUser(db, email)) fail("That email address has already applied or has an account.");
        if (!files.file) fail("Please attach your first aid certificate.");
        db.venuemanagers.push({ username: email, active: false, FirstName: clean(p.firstName, 100), LastName: clean(p.lastName, 100),
            mobile: clean(p.mobile, 20), payRate: 0, comments: "", commentDate: null, firstAid: files.file.name });
        return json({ success: true, message: "Application received. You will hear from us soon." });
    };
    api["nominationForm.php"] = function (db, p) {
        var team = clean(p.nameTeam, 150);
        if (!team) fail("Please enter a team name.");
        if (!/^U\d{1,2}$/.test(p.ageGroup || "")) fail("Please choose an age group.");
        if (["open", "girls"].indexOf(p.gender) === -1) fail("Please choose a gender.");
        if (["1", "2"].indexOf(p.division) === -1) fail("Please choose a division.");
        var players = [];
        for (var i = 1; i <= 15; i++) {
            var f = clean(p["firstName" + i], 100), l = clean(p["lastName" + i], 100);
            if (f || l) players.push({ ffa: clean(p["ffa" + i], 30), firstName: f, lastName: l, dob: p["dob" + i] || null });
        }
        if (players.length < 5) fail("Please list at least 5 players.");
        if (!clean(p.nameCoach) || !(p.emailCoach || p.mobileCoach)) fail("Please enter the coach and their email or mobile.");
        var tid = db.nextId++;
        db.teams.push({ id: tid, name: team, age: p.ageGroup, gender: p.gender, division: p.division, approved: 0 });
        players.forEach(function (pl) { pl.id = db.nextId++; pl.team = tid; pl.registered = 0; db.players.push(pl); });
        [["Coach", "coach"], ["Manager", "manager"], ["3rd", "3rd"]].forEach(function (s) {
            var name = clean(p["name" + s[0]], 200);
            if (name && (p["email" + s[0]] || p["mobile" + s[0]])) {
                db.staff.push({ id: db.nextId++, name: name, email: p["email" + s[0]] || "", mobile: clean(p["mobile" + s[0]], 20), type: s[1], team: tid, registered: 0 });
            }
        });
        return json({ success: true, message: "Team submitted. (Simulated: in the real app a confirmation email goes to the coach.)" });
    };

    // --- nominations admin
    api["getTeams.php"] = function (db, p) {
        requireAdmin();
        var list = db.teams.filter(function (t) { return p.username === "pending" ? !t.approved : p.username === "approved" ? t.approved : true; });
        return json(sortBy(list, function (t) { return t.age + t.gender + t.division + t.name; }).map(function (t) {
            var o = Object.assign({}, t);
            o.players = db.players.filter(function (pl) { return pl.team === t.id; }).length;
            return o;
        }));
    };
    api["changeApproval.php"] = function (db, p) {
        requireAdmin();
        var m = String(p.data || "").match(/^(\d+)([01])$/);
        if (!m) fail("Bad request.");
        db.teams.forEach(function (t) { if (t.id == m[1]) t.approved = +m[2]; });
        return json({ success: true });
    };
    api["removeTeam.php"] = function (db, p) {
        requireAdmin();
        db.players.forEach(function (pl) { if (pl.id == p.data) pl.team = 0; });
        return json({ success: true });
    };
    api["getPlayers.php"] = function (db, p) {
        requireAdmin();
        function teamName(id) { var t = db.teams.filter(function (x) { return x.id === id; })[0]; return t ? t.name : null; }
        var list = /^\d+$/.test(p.username || "") ? db.players.filter(function (pl) { return pl.team == p.username; }) : db.players;
        return json(sortBy(list, function (pl) { return (teamName(pl.team) || "") + pl.lastName + pl.firstName; })
            .map(function (pl) { var o = Object.assign({}, pl); o.teamName = teamName(pl.team); return o; }));
    };
    api["getStaff.php"] = function (db) {
        requireAdmin();
        return json(db.staff.map(function (s) {
            var t = db.teams.filter(function (x) { return x.id === s.team; })[0];
            return { name: s.name, email: s.email, mobile: s.mobile, type: s.type, team: t ? t.name : null, registered: s.registered };
        }));
    };
    api["getCompetitionNumbers.php"] = function (db) {
        requireAdmin();
        var c = {};
        db.teams.forEach(function (t) { var k = t.age + " " + t.gender + " div " + t.division; c[k] = (c[k] || 0) + 1; });
        return html("<p>" + Object.keys(c).sort().map(function (k) { return h(k + ": " + c[k]); }).join("<br>") + "</p>");
    };
    api["updateReg.php"] = function (db) {
        requireAdmin();
        db.players.forEach(function (pl) {
            pl.registered = db.pfRegistrations.some(function (r) {
                return (pl.ffa && r.ffa === pl.ffa) || (r.firstName === pl.firstName && r.lastName === pl.lastName);
            }) ? 1 : 0;
        });
        return json({ success: true });
    };

    // --- users admin
    api["addNewReferee.php"] = function (db, p) {
        requireAdmin();
        var email = String(p.email || "").trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) fail("Enter a valid email address.");
        if (!clean(p.firstName) || !clean(p.lastName)) fail("Enter a first and last name.");
        if (findUser(db, email)) fail("That email already has an account.");
        var pw = randomPassword();
        db.referees.push({ username: email, active: true, password: pw, FirstName: clean(p.firstName, 100), LastName: clean(p.lastName, 100), comments: "", commentDate: null });
        return json({ success: true, password: pw });
    };
    api["getUserList.php"] = function (db) {
        requireAdmin();
        var rows = db.referees.map(function (r) { return { type: "referee", username: r.username, FirstName: r.FirstName, LastName: r.LastName, payRate: null, firstAid: null, active: r.active ? 1 : 0 }; })
            .concat(db.venuemanagers.map(function (v) {
                return { type: "venuemanager", username: v.username, FirstName: v.FirstName, LastName: v.LastName, payRate: Number(v.payRate).toFixed(2), firstAid: null, active: v.active ? 1 : 0 };
            }));
        return json(sortBy(rows, function (u) { return u.active + u.type + u.FirstName + u.LastName; }));
    };
    api["manageUser.php"] = function (db, p) {
        requireAdmin();
        var list = p.type === "referee" ? db.referees : p.type === "venuemanager" ? db.venuemanagers : null;
        if (!list) fail("Bad user type.");
        var u = list.filter(function (r) { return r.username === p.username; })[0];
        if (!u) fail("No such user.");
        if (p.action === "payRate") {
            if (list !== db.venuemanagers) fail("Only venue managers have a pay rate.");
            var rate = parseFloat(p.rate);
            if (isNaN(rate) || rate < 0 || rate > 200) fail("Pay rate must be a number of dollars per hour.");
            u.payRate = rate;
            return json({ success: true });
        }
        if (p.action === "reset" && !u.active) { // approving an application is allowed in the demo
            u.active = true;
            u.password = randomPassword();
            return json({ success: true, password: u.password });
        }
        fail("Resetting and deleting accounts is turned off on the demo site.", 403);
    };

    // ------------------------------------------------------------ hook into jQuery

    $.ajaxTransport("+*", function (options) {
        var m = String(options.url).match(/(?:^|\/)refereeapp\/([A-Za-z]+\.php)/);
        if (!m) return undefined; // not an API call: let jQuery fetch it normally
        var handler = api[m[1]];
        return {
            send: function (headers, done) {
                var params = {}, files = {};
                if (typeof FormData !== "undefined" && options.data instanceof FormData) {
                    options.data.forEach(function (v, k) {
                        if (typeof File !== "undefined" && v instanceof File) { if (v.size) files[k] = v; } else params[k] = v;
                    });
                } else {
                    params = parseForm(options.data || (options.url.split("?")[1] || ""));
                }
                var finish = function (r) {
                    done(r.status, r.status < 400 ? "success" : "error", { text: r.body }, "Content-Type: " + r.type + "; charset=utf-8");
                };
                setTimeout(function () { // answer asynchronously, like a real server
                    var db = load();
                    try {
                        var r = handler ? handler(db, params, files) : json({ success: false, error: "Not found." }, 404);
                        Promise.resolve(r).then(function (res) { save(); finish(res); }, function (err) {
                            if (err instanceof Reply) finish(err); else { console.error(err); finish(json({ success: false, error: "Server error, please try again." }, 500)); }
                        });
                    } catch (err) {
                        if (err instanceof Reply) finish(err); else { console.error(err); finish(json({ success: false, error: "Server error, please try again." }, 500)); }
                    }
                }, 60);
            },
            abort: function () { }
        };
    });

    // ------------------------------------------------------------ banner

    $(function () {
        var css = "#demoBanner{position:fixed;z-index:99999;left:50%;bottom:12px;transform:translateX(-50%);" +
            "max-width:calc(100% - 32px);box-sizing:border-box;background:#1f2328;color:#fff;font:13px/1.4 system-ui,sans-serif;" +
            "padding:8px 12px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.3);display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;justify-content:center;text-align:center}" +
            "#demoBanner a{color:#7cc7ff;text-decoration:underline}" +
            "#demoBanner button{font:inherit;background:#46b7e5;color:#06222e;border:0;border-radius:6px;padding:3px 10px;cursor:pointer}" +
            "#demoBanner .x{background:transparent;color:#aaa;padding:0 4px}";
        css += "body{padding-bottom:96px !important}";
        $("<style>").text(css).appendTo("head");
        var bar = $('<div id="demoBanner" role="note"><strong>Simulated demo</strong><span>Real front end, fake server in your browser. Nothing is sent.</span>' +
            '<a href="../">Case study</a><button type="button" class="reset">Reset data</button><button type="button" class="x" aria-label="Hide">&times;</button></div>');
        bar.find(".reset").on("click", function () { window.ncfDemoReset(); window.location.href = "index.html"; });
        bar.find(".x").on("click", function () { bar.remove(); });
        $("body").append(bar);
    });
})();
