/* global RspamdSpamness:false, RspamdSpamnessColumn:false */

"use strict";

RspamdSpamness.Message = {};

/**
 * Display headers in msgHeaderView box.
 * @param {boolean} [update_rules=false] - Just redraw "Rules" header, leave other headers as they are.
 */
RspamdSpamness.Message.displayHeaders = function (update_rules) {
    const {prefs} = Services;

    const id = {
        score: {
            hdr: {
                bayes: {
                    icon:  "rspamdSpamnessBayesIcon",
                    score: "rspamdSpamnessBayesHeader"
                },
                fuzzy: {
                    icon:  "rspamdSpamnessFuzzyIcon",
                    score: "rspamdSpamnessFuzzyHeader"
                },
                score: {
                    icon:  "rspamdSpamnessScoreIcon",
                    score: "rspamdSpamnessScoreHeader"
                }
            }
        }
    };

    const el = {
        greyl: {
            hdr: getEl("expandedRspamdSpamnessGreylistHeader"),
            row: getEl("expandedRspamdSpamnessGreylistRow")
        },
        rules: {
            box: getEl("expandedRspamdSpamnessRulesBox"),
            row: getEl("expandedRspamdSpamnessRulesRow")
        },
        scanTime: getEl("rspamdSpamnessScanTimeHeader"),
        score: {
            row: getEl("expandedRspamdSpamnessRow")
        }
    };

    const show = {
        greyl: update_rules ? false : getPref("extensions.rspamd-spamness.display.messageGreylist"),
        rules: getPref("extensions.rspamd-spamness.display.messageRules"),
        score: update_rules ? false : getPref("extensions.rspamd-spamness.display.messageScore")
    };

    function getEl(id) {
        return document.getElementById(id);
    }

    function getPref(prefName) {
        try {
            return prefs.getBoolPref(prefName);
        } catch (e) {
            RspamdSpamness.err(e);
        }
    }

    function getHeaderBody(msgHeaders, name) {
        const headerBody = [];
        if (name in msgHeaders) {
            msgHeaders[name].forEach(function (body) {
                if (body !== null)
                    headerBody.push(body);
            });
        }
        return headerBody;
    }

    function b64DecodeUnicode(str) {
        return decodeURIComponent(atob(str).split("").map(function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(""));
    }

    if (!update_rules) {
        el.greyl.row.collapsed = true;
        el.score.row.collapsed = true;
        el.rules.row.collapsed = true;
    }

    // Height could be set on more indicator click. Remove it.
    getEl("expandedHeaderView").removeAttribute("height");

    const msg = gMessageDisplay.displayedMessage;

    if (show.greyl && msg.folder) {
        MsgHdrToMimeMessage(msg, null, function (aMsgHdr, aMimeMsg) {
            const greylistHeaders = getHeaderBody(aMimeMsg.headers, "x-rmilter-greylist");
            el.greyl.row.collapsed = (greylistHeaders.length === 0);
            el.greyl.hdr.headerValue = greylistHeaders;
            el.greyl.hdr.valid = true;
        }, true, {
            partsOnDemand: true
        });
    }

    if (!show.score && !show.rules)
        return;

    if (gDBView.msgFolder === null)
        return;

    const hdr = gDBView.msgFolder.GetMessageHeader(gDBView.getKeyAt(gDBView.currentlyDisplayedMessage));

    if (!hdr)
        return;

    // Get symbols from Rmilter header
    RspamdSpamness.Message.headerStr = RspamdSpamness.getHeaderStr(hdr);
    if (RspamdSpamness.Message.headerStr) {

        const converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"]
            .createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
        converter.charset = "UTF-8";
        RspamdSpamness.Message.headerStr = converter.ConvertToUnicode(RspamdSpamness.Message.headerStr);

        const s = RspamdSpamness.Message.headerStr.match(/: \S+ \[[-\d.]+ \/ [-\d.]+\] *(.*)$/);
        if (s) {
            displayScoreRulesHeaders(s[1]);
            return;
        }
    }

    // Get symbols from Exim header
    if (msg.folder) {
        MsgHdrToMimeMessage(msg, null, function (aMsgHdr, aMimeMsg) {
            [RspamdSpamness.Message.headerStr] = getHeaderBody(aMimeMsg.headers, "x-spam-report");
            if (RspamdSpamness.Message.headerStr) {
                const s = RspamdSpamness.Message.headerStr.match(/^Action: [ a-z]+?(Symbol: .*)Message-ID:/);
                if (s) {
                    displayScoreRulesHeaders(s[1]);
                }
            }
        }, true, {
            partsOnDemand: true
        });
    }

    // Get symbols from LDA mode header
    if (msg.folder) {
        MsgHdrToMimeMessage(msg, null, function (aMsgHdr, aMimeMsg) {
            const hdrBody = getHeaderBody(aMimeMsg.headers, "x-spam-result");
            if (hdrBody) {
                RspamdSpamness.Message.headerStr = b64DecodeUnicode(hdrBody);
                if (RspamdSpamness.Message.headerStr) {
                    const metric = JSON.parse(RspamdSpamness.Message.headerStr).default;
                    let s = null;
                    for (let item in metric) { // eslint-disable-line prefer-const
                        const symbol = metric[item];
                        if (symbol.name) {
                            s += " " + symbol.name +
                                "(" + symbol.score.toFixed(2) + ")" +
                                "[" + (symbol.options ? symbol.options.join(", ") : "") + "]";
                        }
                    }
                    if (s) {
                        displayScoreRulesHeaders(s);
                    }
                }
            }
        }, true, {
            partsOnDemand: true
        });
    }

    function displayScoreRulesHeaders(symbols) {
        if (show.score) {
            const parsed = [];
            parsed.score = RspamdSpamnessColumn.getScoreByHdr(hdr);
            el.score.row.collapsed = (parsed.score === null);

            if (parsed.score === null) {
                el.score.score.headerValue = "";
                return;
            }

            const b = symbols.match(/BAYES_(?:HAM|SPAM)\(([-\d.]+)\)(\[[^\]]+?\])?/);
            parsed.bayes = (b) ? b[1] : "undefined";
            parsed.bayesOptions = (b && b[2]) ? " " + b[2] : "";

            const re = /FUZZY_(?:WHITE|PROB|DENIED|UNKNOWN)\(([-\d.]+)\)/g;
            let fuzzySymbols = [];
            parsed.fuzzy = 0;
            let fuzzySymbolsCount = 0;
            while ((fuzzySymbols = re.exec(symbols)) !== null) {
                parsed.fuzzy += parseFloat(fuzzySymbols[1]);
                fuzzySymbolsCount++;
            }
            parsed.fuzzy = (parsed.fuzzy)
                ? Number(parseFloat(parsed.fuzzy).toFixed(10))
                : "undefined";

            const fuzzyCounter = (fuzzySymbolsCount > 1)
                ? "{" + fuzzySymbolsCount + "}"
                : "";

            const hdrVal = {
                bayes: parsed.bayes + parsed.bayesOptions + ", Fuzzy" + fuzzyCounter + ":",
                fuzzy: parsed.fuzzy + " )",
                score: parsed.score + " ( Bayes:"
            };

            for (let key in id.score.hdr) { // eslint-disable-line prefer-const
                getEl(id.score.hdr[key].icon).src = RspamdSpamness.getImageSrc(parsed[key]);
                getEl(id.score.hdr[key].score).headerValue = hdrVal[key];
            }

            if (msg.folder) {
                MsgHdrToMimeMessage(msg, null, function (aMsgHdr, aMimeMsg) {
                    let scanTime = getHeaderBody(aMimeMsg.headers, "x-rspamd-scan-time");
                    if (!scanTime.length) {
                        scanTime = getHeaderBody(aMimeMsg.headers, "x-spam-scan-time");
                    }
                    el.scanTime.headerValue = (scanTime.length)
                        ? "Scan time: " + scanTime
                        : "";
                }, true, {
                    partsOnDemand: true
                });
            }
        }

        if (show.rules) {
            if (el.rules.box.clearHeaderValues)
                el.rules.box.clearHeaderValues();

            let num = 0;
            const parsed_symbols = [];

            (function (a) {
                let parsed_symbol = [];
                let s = [];
                const re = /(\S+\(([^)]+)\))(\[.*?\])?/g;
                while ((parsed_symbol = re.exec(symbols)) !== null) {
                    s = [];
                    [, s.name, s.score, s.options] = parsed_symbol;
                    a.push(s);
                }
            })(parsed_symbols);

            const prefName = "extensions.rspamd-spamness.headers.symbols_order";
            const symOrder = prefs.getCharPref(prefName).toLowerCase();
            const compare = (symOrder === "name")
                ? function (a, b) {
                    return a.name.localeCompare(b.name);
                }
                : function (a, b) {
                    return Math.abs(a.score) < Math.abs(b.score);
                };

            parsed_symbols
                .sort(compare)
                .forEach(function (s) {
                    el.rules.box.addLinkView({
                        class: RspamdSpamness.getMetricClass(s.name),
                        displayText: s.name,
                        tooltiptext: s.options
                    });
                    num++;
                });

            if (num) {
                el.rules.box.buildViews();
            } else {
                el.rules.row.collapsed;
            }
        }
    }
};

RspamdSpamness.Message.changeSymOrder = function (prefValue) {
    let prefVal = prefValue;
    const {prefs} = Services;
    const prefName = "extensions.rspamd-spamness.headers.symbols_order";
    if (!arguments.length) {
        prefVal = (prefs.getCharPref(prefName).toLowerCase() === "name")
            ? "score"
            : "name";
    }
    prefs.setCharPref(prefName, prefVal);
    RspamdSpamness.Message.displayHeaders(true);
};

RspamdSpamness.Message.openRulesDialog = function () {
    // Insert line breaks
    const re = /( +(?:(?:Symbol?: )?[^) ]+\)(?:\[[^\]]*\])?|Message-ID: [^ ]+?))/g;
    const content = RspamdSpamness.Message.headerStr.replace(re, "\n$1");

    window.openDialog(
        "chrome://rspamd-spamness/content/rulesDialog.xul", "",
        "chrome,modal,dialog,width=720,height=420,centerscreen,resizable",
        content
    );
};

RspamdSpamness.Message.onLoad = function () {
    const listener = {};
    listener.onStartHeaders = function () {
        // Do nothing.
    };
    listener.onEndHeaders = function () {
        RspamdSpamness.Message.displayHeaders();
    };
    gMessageListeners.push(listener);
};

RspamdSpamness.Message.onUnload = function () {
    window.removeEventListener("load", RspamdSpamness.Message.onLoad, false);
    window.removeEventListener("unload", RspamdSpamness.Message.onUnload, false);
};

window.addEventListener("load", RspamdSpamness.Message.onLoad, false);
window.addEventListener("unload", RspamdSpamness.Message.onUnload, false);
