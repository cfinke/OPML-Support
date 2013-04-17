var OPMLSUPPORT_BROWSER = {
	prefs : Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.opmlsupport."),
	
	load : function () {
		removeEventListener("load", OPMLSUPPORT_BROWSER.load, false);
		
		setTimeout(OPMLSUPPORT_BROWSER.showFirstRun, 1500);
	},
	
	getVersion : function (callback) {
		var addonId = "{9458ca25-39fd-4ba8-9520-acc5c0d877b6}";
		
		if ("@mozilla.org/extensions/manager;1" in Components.classes) {
			// < Firefox 4
			var version = Components.classes["@mozilla.org/extensions/manager;1"]
				.getService(Components.interfaces.nsIExtensionManager).getItemForID(addonId).version;
			
			callback(version);
		}
		else {
			// Firefox 4.
			Components.utils.import("resource://gre/modules/AddonManager.jsm");  
			
			AddonManager.getAddonByID(addonId, function (addon) {
				callback(addon.version);
			});
		}
	},
	
	showFirstRun : function () {
		function doShowFirstRun(version) {
			if (!OPMLSUPPORT_BROWSER.prefs.getCharPref("version")) {
				var theTab = gBrowser.addTab("http://www.chrisfinke.com/firstrun/opml-support.php?v="+version);
				gBrowser.selectedTab = theTab;
			}
			
			OPMLSUPPORT_BROWSER.prefs.setCharPref("version", version);
		}
		
		OPMLSUPPORT_BROWSER.getVersion(doShowFirstRun);
	}
};