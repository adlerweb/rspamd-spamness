var {ExtensionCommon} = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
var {ExtensionSupport} = ChromeUtils.import("resource:///modules/ExtensionSupport.jsm");
const { ThreadPaneColumns } = ChromeUtils.importESModule("chrome://messenger/content/thread-pane-columns.mjs");
var Services = globalThis.Services || ChromeUtils.import("resource://gre/modules/Services.jsm").Services;
var [majorVersion] = Services.appinfo.platformVersion.split(".", 1);

var scoreColumn = class extends ExtensionCommon.ExtensionAPI {
    onShutdown(isAppShutdown) {
        if (isAppShutdown) return;

        /*
         * A workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=1634348
         * Probably the add-on will be updated. Invalidating the startup cache.
         */
        Services.obs.notifyObservers(null, "startupcache-invalidate");
    }

    getAPI(context) {
        const localStorage = {};

        const {ExtensionParent} =
            ChromeUtils.import("resource://gre/modules/ExtensionParent.jsm");
        const extension = ExtensionParent.GlobalManager
            .getExtension("rspamd-spamness@alexander.moisseev");
        Services.scriptloader.loadSubScript(extension.getURL("scripts/libCommon.js"));
        Services.scriptloader.loadSubScript(extension.getURL("experiments/libExperiments.js"));

        context.callOnClose(this);
        return {
            scoreColumn: {
                getCharPref(prefName) {
                    return Services.prefs.getCharPref(prefName);
                },
                async init()    {
                    const columnId = "spamScoreCol";

                    function getScore(row) {
                        if (localStorage["display-column"] === "image")
                            return null;
                        const score = libCommon.getScoreByHdr(row, localStorage.header, true);
                        return (isNaN(score)) ? "" : score.toFixed(2);
                    }

                    function getImage(row) {
                        if (localStorage["display-column"] === "text")
                            return null;
                        const score = libCommon.getScoreByHdr(row, localStorage.header, true);
                        if (localStorage["display-columnImageOnlyForPositive"] && score <= 0)
                            return null;
                        //Still broken
                        return extension.getURL(libCommon.getImageSrc(score));
                    }

                    ThreadPaneColumns.addCustomColumn(
                        columnId, {
                            name: context.extension.localeData.localizeMessage("spamnessColumn.label"),
                            hidden: false,
                            icon: false,
                            resizable: true,
                            sortable: true,
                            textCallback: getScore,
                            iconCallback: getImage
                        }
                    );
                },

                savePrefFile() {
                    Services.prefs.savePrefFile(null);
                },
                setCharPref(prefName, newPref) {
                    Services.prefs.setCharPref(prefName, newPref);
                },
                setLocalStorage(newSettings) {
                    for (const key in newSettings) {
                        if (newSettings[key] === null) delete newSettings[key];
                    }
                    Object.assign(localStorage, newSettings);
                }
            },
        };
    }

    close() {
        const columnId = "spamScoreCol";
        ThreadPaneColumns.removeCustomColumn(columnId);
    }
};
