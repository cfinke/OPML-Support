var OPMLSUPPORT = {
	get strings() { return document.getElementById("opml-support-bundle"); },
	
	importOPML : function () {
		var nsIFilePicker = Components.interfaces.nsIFilePicker;
		var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
		fp.appendFilter(this.strings.getString("allFiles"),"*");

		fp.init(window, this.strings.getString("selectFile"), nsIFilePicker.modeOpen);
		
		var res = fp.show();
		
		if (res == nsIFilePicker.returnOK) {
			//read any xml file by using XMLHttpRequest.
			//any character code is converted to native unicode automatically.
			var url = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService).newFileURI(fp.file);
			
			var reader = new XMLHttpRequest();
			reader.open("GET", url.spec, false);
			reader.overrideMimeType("application/xml");
			reader.send(null);
			
			var opmldoc = reader.responseXML;
			
			var results = [];
			
			// At this point, we have an XML doc in opmldoc
			
			var bodyTags = opmldoc.getElementsByTagName("body");
			
			if (bodyTags.length == 0) {
				OPMLSUPPORT.alert(OPMLSUPPORT.strings.getString("opml.malformedDocument"));
				return;
			}
			
			var nodes = bodyTags[0].childNodes;
		
			for (var i = 0; i < nodes.length; i++){
				if (nodes[i].nodeName == 'outline'){
					results = this.importNode(results, nodes[i]);
				}
			}
			
			// Now we have the structure of the file in an array.
			var carr = {folders : 0, links : 0, feeds : 0};
		
			for (var i = 0; i < results.length; i++){
				carr = this.countItems(results[i], carr);
			}
			
			OPMLSUPPORT.totalToImport = carr.feeds + carr.links;
			
			// Depending on the structure of the imported file, we may need
			// to check with the user as to what they want to import.
		
			if ((carr.folders > 0) || (carr.feeds > 0)){
				window.openDialog("chrome://opml-support/content/import-wizard.xul","import","chrome,centerscreen,modal",results, carr);
			}
			else {
				// This will only happen if it is a flat file containing
				// only bookmarks.
				this.importLevel(results, null, false, true, true);
			}
		}
		
		OPMLSUPPORT.reportAllTime();
	},
	
	alert : function (msg) {
		var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]  
			.getService(Components.interfaces.nsIPromptService);  
		prompts.alert(null, OPMLSUPPORT.strings.getString("opml.opmlSupport"), msg);
	},
	
	importLevel : function(nodes, createIn, nested, links, feeds, feedsAs){
		var ioService = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
		var bmsvc = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"].getService(Components.interfaces.nsINavBookmarksService);
		var annotationService = Components.classes["@mozilla.org/browser/annotation-service;1"].getService(Components.interfaces.nsIAnnotationService);
		var livemarkService = Components.classes["@mozilla.org/browser/livemark-service;2"].getService(Components.interfaces.nsILivemarkService);
		
		if (!feedsAs) feedsAs = 'feeds';
		
		var menu = Application.bookmarks.menu;
		var toolbar = Application.bookmarks.toolbar;
		var unfiled = Application.bookmarks.unfiled;
		
		var count = 0;
		var total = OPMLSUPPORT.totalToImport;
		
		function _importLevel(nodes, createIn) {
			if (!createIn){
				createIn = Application.bookmarks.menu;
			}
			
			var len = nodes.length;
			
			for (var i = 0; i < len; i++){
				var node = nodes[i];
				var nodeTitle = node.title;
				var nodeType = node.type;
				var nodeDesc = node.desc;
				
				if (nodeType == 'folder'){	
					var newCreateIn = createIn;
					
					if (nested) {
						switch (nodeTitle) {
							case "Bookmarks Menu":
								newCreateIn = menu;
							break;
							case "Bookmarks Toolbar":
								newCreateIn = toolbar;
							break;
							case "Unfiled Bookmarks":
								newCreateIn = unfiled;
							break;
							default:
								newCreateIn = createIn.addFolder(nodeTitle);
							break;
						}
					}
					
					_importLevel(node.children, newCreateIn);
				}
				else {
					var uri = ioService.newURI(node.url, null, null);

					if (feeds && (nodeType == 'feed' || nodeType == 'atom')){
						if (feedsAs == 'feeds'){
							var feedUri = ioService.newURI(node.feedURL, null, null);
							var lm = livemarkService.createLivemarkFolderOnly(createIn.id, nodeTitle, uri, feedUri, -1);
							annotationService.setItemAnnotation(lm, "bookmarkProperties/description", nodeDesc, 0, Components.interfaces.nsIAnnotationService.EXPIRE_NEVER);
						}
						else {
							var bm = createIn.addBookmark(nodeTitle, uri);
							bm.description = nodeDesc;
						}
					}
					else if (links && (nodeType == 'link')) {
						var bm = createIn.addBookmark(nodeTitle, uri);
						bm.keyword = node.keyword;
						bm.description = nodeDesc;
					}
				}
			}
		}
		
		_importLevel(nodes, createIn);
	},
	
	countItems : function (arr, carr) {
		if (arr.type == "folder"){
			carr.folders++;
			
			for (var i = 0; i < arr.children.length; i++){
				carr = this.countItems(arr.children[i], carr);
			}
		}
		else if (arr.type == "link"){
			carr.links++;
		}
		else if (arr.type == "feed"){
			carr.feeds++;
		}
		
		return carr;
	},
	
	importNode : function (results, node){
		var hash = {};
		hash.title = node.getAttribute("text");
		hash.keyword = '';
		
		if (node.childNodes.length > 0){
			hash.type = "folder";
			hash.children = [];
			
			var children = node.childNodes;
			
			for (var i = 0; i < children.length; i++){
				if (children[i].nodeName == 'outline'){
					hash.children = this.importNode(hash.children, children[i]);
				}
			}
			
			results.push(hash);
		}
		else {
			if (node.getAttribute("type") == "link"){
				hash.type = 'link';
				hash.url = node.getAttribute("url");
				hash.keyword = node.getAttribute("keyword");
			}
			else {
				hash.type = 'feed';
				hash.feedURL = node.getAttribute("xmlUrl");
				hash.url = node.getAttribute("htmlUrl");
				if (!hash.url) hash.url = hash.feedURL;
			}
			
			hash.desc = node.getAttribute("description");
			
			if (!hash.desc) hash.desc = '';
			
			results.push(hash);
		}
		
		return results;
	},
	
	exportOPML : function () {
		// Show a dialog, allow the user to pick bookmarks or livemarks or all
		window.openDialog('chrome://opml-support/content/export-wizard.xul','export','chrome,centerscreen,modal');
	},
	
	doExportOPML : function (feeds, links, nested, feedMode) {
		var filePrefix = OPMLSUPPORT.strings.getString("opml.exportLiveBookmarksFilename");
		var title = OPMLSUPPORT.strings.getString("opml.exportLiveBookmarksTitle");
		
		if (feeds && links) {
			filePrefix = OPMLSUPPORT.strings.getString("opml.exportAllFilename");
			title = OPMLSUPPORT.strings.getString("opml.exportAllTitle");
		}
		else if (links) {
			filePrefix = OPMLSUPPORT.strings.getString("opml.exportBookmarksFilename");
			title = OPMLSUPPORT.strings.getString("opml.exportBookmarksTitle");
		}
		
		var file = this.promptForFile( filePrefix );
		
		if ( ! file )
			return;

		var opmlDocument = document.implementation.createDocument( null, 'opml', null );
		opmlDocument.documentElement.setAttribute( 'version', '1.0' );
		
		var opmlHead = opmlDocument.createElement( 'head' );
		var opmlTitle = opmlDocument.createElement( 'title' );
		opmlTitle.appendChild( opmlDocument.createTextNode( title ) );
		opmlHead.appendChild( opmlTitle );
		var opmlDateCreated = opmlDocument.createElement( 'dateCreated' );
		opmlDateCreated.appendChild( opmlDocument.createTextNode( ( new Date() ).toString() ) );
		opmlHead.appendChild( opmlDateCreated );
		opmlDocument.documentElement.appendChild( opmlHead );
		
		var opmlBody = opmlDocument.createElement( 'body' );
		
		var livemarkService = Components.classes["@mozilla.org/browser/livemark-service;2"].getService(Components.interfaces.nsILivemarkService);

		function iterate( root, docNode, isBase) {
			if ( ! root.children )
				return;

			if ( ! isBase && nested ) {
				var containerNode = docNode.ownerDocument.createElement( 'outline' );
				containerNode.setAttribute( 'text', root.title );
			}
			else {
				var containerNode = docNode;
			}

			var rc = root.children;

			for ( var i = 0, _len = rc.length; i < _len; i++ ) {
				var node = rc[i];
				var type = node.type;
				var id = node.id;

				// No separators for us.
				if ( type != 'bookmark' && type != 'folder' )
					continue;

				if ( ( type == "folder" ) && ( ! livemarkService.isLivemark( node.id ) ) ) {
					iterate( node, containerNode );
					continue;
				}

				var title = node.title || '';
				var description = node.description || '';

				if ( type == 'bookmark' ) {
					var url = node.uri.spec || '';
					var keyword = node.keyword || '';
				}
				else {
					var xmlUrl = livemarkService.getFeedURI( id ).spec;
					try { var url = livemarkService.getSiteURI( id ).spec; } catch ( e ) { var url = xmlUrl; }
					var keyword = "";
				}

				if ( ( links && ( type == 'bookmark' ) ) || ( feeds && ( type == 'folder' ) && ( feedMode == 'links' ) ) ) {
					// Bookmark or Livemark as a bookmark
					var node = containerNode.ownerDocument.createElement( 'outline' );
					node.setAttribute( 'type', 'link' );
					node.setAttribute( 'text', title );
					node.setAttribute( 'url', url );
					node.setAttribute( 'description', description );
					node.setAttribute( 'keyword', keyword );
					containerNode.appendChild( node );
				}
				else if ( feeds && ( type == 'folder' ) && ( feedMode != 'links' ) ) {
					// Livemark
					var node = containerNode.ownerDocument.createElement( 'outline' );
					node.setAttribute( 'type', 'rss' );
					node.setAttribute( 'version', 'RSS' );
					node.setAttribute( 'text', title );
					node.setAttribute( 'htmlUrl', url );
					node.setAttribute( 'xmlUrl', xmlUrl );
					node.setAttribute( 'description', description );
					containerNode.appendChild( node );
				}
			}
			
			if ( containerNode != docNode && containerNode.childNodes.length > 0 )
				docNode.appendChild( containerNode );
		}

		var abm = Application.bookmarks;
		
		var roots = [ abm.menu, abm.toolbar, abm.unfiled ];
		
		for ( var i = 0, _len = roots.length; i < _len; i++ )
			iterate( roots[i], opmlBody );
		
		opmlDocument.documentElement.appendChild( opmlBody );
		
		var data = ( new XMLSerializer() ).serializeToString( opmlDocument );
		data = '<?xml version="1.0" encoding="UTF-8"?>' + "\n" + data;
		
		// Convert to utf-8 from native unicode
		var converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].getService(Components.interfaces.nsIScriptableUnicodeConverter);
		converter.charset = 'UTF-8';
		data = converter.ConvertFromUnicode(data);
		var outputStream = Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);

		outputStream.init(file, 0x04 | 0x08 | 0x20, 420, 0 );
		outputStream.write(data, data.length);
		outputStream.close();
	},
	
	promptForFile : function (filePrefix) {
		var nsIFilePicker = Components.interfaces.nsIFilePicker;
		var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
		fp.init(window, this.strings.getString("saveAs"), nsIFilePicker.modeSave);
		
		fp.appendFilter(this.strings.getString("allFiles"),"*");
		
		fp.defaultString = filePrefix + ".opml";
		
		var result = fp.show();
		
		if (result == nsIFilePicker.returnCancel){
			return false;
		}
		else {
			return fp.file;
		}
	},
	
	/* DEBUG FUNCTIONS */

	lastTime : null,
	firstTime : null,
	totalToImport : 0,
	
	agg : {},
	
	reportTime : function (label) {
		var date = new Date();
		
		if (this.lastTime) timeSince = date.getTime() - this.lastTime.getTime();
		else timeSince = 0;
		
		if (!this.firstTime) {
			this.firstTime = date;
			timeSinceFirst = 0;
		}
		else {
			timeSinceFirst = date.getTime() - this.firstTime.getTime();
		}
		
		this.lastTime = date;
		
		var consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
		if (!this.agg[label]) this.agg[label] = timeSince;
		else this.agg[label] += timeSince;
		consoleService.logStringMessage("OPML: " + label + " " + (date.getTime()) + " (" + timeSince + ") (" + timeSinceFirst+ ")");
	},
	
	reportAllTime : function () {
	    for (var i in this.agg) {
	        OPMLSUPPORT.log(i + ": " + this.agg[i]);
        }
    },

	log : function (message) {
		var consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
		consoleService.logStringMessage("OPML: " + message);
	}
};