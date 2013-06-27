var OPMLSUPPORT = {
	strings : {
		_backup : null,
		_main : null,

		initStrings : function () {
			if (!this._backup) { this._backup = document.getElementById("opml-support-backup-bundle"); }
			if (!this._main) { this._main = document.getElementById("opml-support-bundle"); }
		},

		getString : function (key) {
			this.initStrings();

			var rv = "";

			try {
				rv = this._main.getString(key);
			} catch (e) {
			}

			if (!rv) {
				try {
					rv = this._backup.getString(key);
				} catch (e) {
				}
			}

			return rv;
		},

		getFormattedString : function (key, args) {
			this.initStrings();

			var rv = "";

			try {
				rv = this._main.getFormattedString(key, args);
			} catch (e) {
			}

			if (!rv) {
				try {
					rv = this._backup.getFormattedString(key, args);
				} catch (e) {
				}
			}

			return rv;
		}
	},
	
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
							var lm = PlacesUtils.livemarks.addLivemark(
								{
									title : nodeTitle,
									feedURI : feedUri,
									parentId : createIn.id,
									index : -1,
									siteURI : uri
								},
								(function(aStatus, aLivemark) {
									if (Components.isSuccessCode(aStatus)) {
										PlacesUtils.setAnnotationsForItem( aLivemark.id, [ { name : "bookmarkProperties/description", vaule : nodeDesc, expires : Components.interfaces.nsIAnnotationService.EXPIRE_NEVER } ] );
									}
								})
							);
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
		
		var file = this.promptForFile(filePrefix);
        
		if (file){
			var data = '';
			data += '<?xml version="1.0" encoding="UTF-8"?>' + "\n";
			data += '<opml version="1.0">' + "\n";
			data += "\t" + '<head>' + "\n";
			data += "\t\t" + '<title><![CDATA[' + title + ']]></title>' + "\n";
			data += "\t\t" + '<dateCreated>' + new Date().toString() + '</dateCreated>' + "\n";
			data += "\t" + '</head>' + "\n";
			data += "\t" + '<body>' + "\n";
			
			this.doExportOPML_new(file, data, feeds, links, nested, feedMode);
		}
		
		//this.reportAllTime();
	},
	
	doExportOPML_new : function (file, data, feeds, links, nested, feedMode) {
		var level = 0;
		var annotationService = Components.classes["@mozilla.org/browser/annotation-service;1"].getService(Components.interfaces.nsIAnnotationService);

		function iterate(root, isBase) {
			if (!isBase && nested) {
				data += '<outline text="' + OPMLSUPPORT.cleanXMLText(root.title) + '">' + "\n";
			}
	
			if (root.children) {
			    var len = root.children.length;
			    var rc = root.children;
			    
				for (var i = 0; i < len; i++) {
					var node = rc[i];
					var type = node.type;
					var id = node.id;
					
					if ((type == "bookmark") || (type == "folder")){
						// No separators for us.
						if ((type == "folder") && (!node.annotations.has('livemark/feedURI'))) {
							iterate(node);
						}
						else {
							var title = node.title || '';
							var description = node.description || '';
						
							if (type == 'bookmark') {
								var url = node.uri.spec || '';
								var keyword = node.keyword || '';
							}
							else {
								var xmlUrl = node.annotations.get('livemark/feedURI');
								var url = node.annotations.get('livemark/siteURI');
								var keyword = "";
							}
						
							if ((links && (type == 'bookmark')) || (feeds && (type == 'folder') && (feedMode == 'links'))) {
								// Bookmark or Livemark as a bookmark
								data += '<outline type="link" text="' + OPMLSUPPORT.cleanXMLText(title) + '" url="' + OPMLSUPPORT.cleanXMLText(url) + '" description="'+OPMLSUPPORT.cleanXMLText(description)+'" keyword="'+OPMLSUPPORT.cleanXMLText(keyword)+'" />';
							}
							else {
								if (feeds && (type == 'folder') && (feedMode != 'links')) {
									// Livemark
									data += '<outline type="rss" version="RSS" text="' + OPMLSUPPORT.cleanXMLText(title) + '" htmlUrl="' + OPMLSUPPORT.cleanXMLText(url) + '" xmlUrl="' + OPMLSUPPORT.cleanXMLText(xmlUrl) + '" description="' + OPMLSUPPORT.cleanXMLText(description) + '"/>' + "\n";
								}
							}
						}
					}
				}
			}

			if (!isBase && nested) {
				data += '</outline>' + "\n";
			}
		}

        var abm = Application.bookmarks;

		data += '<outline text="Bookmarks Menu">' + "\n";
		iterate(abm.menu, true);
		data += '</outline>' + "\n";
		data += '<outline text="Bookmarks Toolbar">' + "\n";
		iterate(abm.toolbar, true);
		data += '</outline>';
		data += '<outline text="Unfiled Bookmarks">' + "\n";
		iterate(abm.unfiled, true);
		data += '</outline>';
		data += '</body>' + "\n";
		data += '</opml>';
		
		//convert to utf-8 from native unicode
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
	
	cleanXMLText : function (str) {
		if (!str) return '';
		
		try {
			var res = [
				{find : '&', replace : '&amp;'},
				{find : '"', replace : '&quot;'},
				{find : '<', replace : '&lt;'},
				{find : '>', replace : '&gt;'}
			];
		
			for (var i = 0; i < res.length; i++){
				var re = new RegExp(res[i].find, "g");
			
				str = str.replace(re, res[i].replace);
			}
		} catch (e) { OPMLSUPPORT.log(str + " " + e); }
		return str;
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