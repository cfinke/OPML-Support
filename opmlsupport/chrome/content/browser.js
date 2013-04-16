var OPMLSUPPORT_BROWSER = {
	load : function () {
		setTimeout( OPMLSUPPORT_BROWSER.showFirstRun, 5000 );
	},
	
	showFirstRun : function () {
		var addonId = "{9458ca25-39fd-4ba8-9520-acc5c0d877b6}";
		
		Components.utils.import( "resource://gre/modules/AddonManager.jsm" );  
		
		AddonManager.getAddonByID( addonId, function ( addon ) {
		    var prefs = Cc["@mozilla.org/preferences-service;1"].getService( Ci.nsIPrefService ).getBranch( "extensions.opmlsupport." );
            
			if ( ! prefs.getCharPref( "version" ) )
			    openUILinkIn( 'http://www.chrisfinke.com/firstrun/opml-support.php?v=' + addon.version, 'tab' );

			prefs.setCharPref( "version", addon.version );
		} );
	}
};