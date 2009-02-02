var OPMLSUPPORT = {
	get strings() { return document.getElementById("opml-support-bundle"); },

	importMenu : null,
	exportMenu : null,
	
	importOption : null,
	exportOption : null,
	
	currentExport : '',
	
	lastTime : null,
	firstTime : null,
	totalToImport : 0,
	
	agg : {},
	
	onload : function (event) {
		this.addMenuOptions();
	},
	
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
	        opmllog(i + ": " + this.agg[i]);
        }
    },
	
	addMenuOptions : function () {
		var menubar = document.getElementById('main-menubar');
		var importOption, exportOption;
		
		for (var i = 0; i < menubar.childNodes.length; i++){
			var menu = menubar.childNodes[i];
			
			for (var j = 0; j < menu.firstChild.childNodes.length; j++){	
				if (importOption && exportOption) {
					break;
				}

				if (menu.firstChild.childNodes[j].getAttribute("command") == "cmd_bm_import"){
					importOption = menu.firstChild.childNodes[j];
				}
				else if (menu.firstChild.childNodes[j].getAttribute("command") == "cmd_bm_export"){
					exportOption = menu.firstChild.childNodes[j];
				}
			}
			
			if (importOption && exportOption) {
				break;
			}
		}
		
		if (!(importOption && exportOption)){
			alert(this.strings.getString("noOptions"));
			return false;
		}

		this.importMenu = document.createElement('menu');
		this.importMenu.setAttribute("label",this.strings.getString("import"));
		this.importMenu.setAttribute("accesskey",this.strings.getString("importKey"));
		this.importMenu.appendChild(document.createElement('menupopup'));
		
		this.exportMenu = document.createElement('menu');
		this.exportMenu.setAttribute("label",this.strings.getString("export"));
		this.exportMenu.setAttribute("accesskey",this.strings.getString("exportKey"));
		this.exportMenu.appendChild(document.createElement('menupopup'));
		
		importOption.parentNode.insertBefore(this.importMenu, importOption);
		importOption.parentNode.insertBefore(this.exportMenu, importOption);

		importOption.setAttribute("label",this.strings.getString("bookmarks"));
		exportOption.setAttribute("label",this.strings.getString("bookmarks"));
		
		importOption.setAttribute("accesskey",this.strings.getString("bookmarksKey"));
		exportOption.setAttribute("accesskey",this.strings.getString("bookmarksKey"));
		
		importOption.parentNode.removeChild(importOption);
		exportOption.parentNode.removeChild(exportOption);
		
		this.importMenu.firstChild.appendChild(importOption);
		this.exportMenu.firstChild.appendChild(exportOption);
		
		this.importOption = document.createElement('menuitem');
		this.exportOption = document.createElement('menuitem');
		
		this.importOption.setAttribute("label",this.strings.getString("OPML"));
		this.importOption.setAttribute("accesskey",this.strings.getString("OPMLKey"));
		this.importOption.setAttribute("command","opml-support-import");
		
		this.exportOption.setAttribute("label",this.strings.getString("OPML"));
		this.exportOption.setAttribute("accesskey",this.strings.getString("OPMLKey"));
		this.exportOption.setAttribute("command","opml-support-export");
		
		this.importMenu.firstChild.appendChild(this.importOption);
		this.exportMenu.firstChild.appendChild(this.exportOption);
		
		return true;
	},
	
	importOPML : function () {
		var nsIFilePicker = Components.interfaces.nsIFilePicker;
		var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
		fp.appendFilter(this.strings.getString("OPMLFiles"),"*.opml");
		fp.appendFilter(this.strings.getString("XMLFiles"),"*.opml; *.xml; *.rdf; *.html; *.htm");
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
			var nodes = opmldoc.getElementsByTagName("body")[0].childNodes;
		
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
	
	importLevel : function(nodes, createIn, nested, links, feeds, feedsAs){
		var livemarkService = Components.classes["@mozilla.org/browser/livemark-service;2"];

		if (livemarkService) {
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
		}
		else {
			this.importLevel_old(nodes, createIn, nested, links, feeds, feedsAs);
		}
	},
	
	importLevel_old : function (nodes, createIn, nested, links, feeds, feedsAs) {
		// nodes is a level of the array created by importNode
		
		if (!feedsAs) feedsAs = 'feeds';
		
		if (!createIn){
			createIn = RDF.GetResource("NC:BookmarksRoot");
		}
		
		for (var i = 0; i < nodes.length; i++){
			if (nodes[i].type == 'folder'){	
				if (nested) {
					var newCreateIn = BMSVC.createFolderInContainer(nodes[i].title, createIn, null);
					this.importLevel_old(nodes[i].children, newCreateIn, true, links, feeds, feedsAs);
				}
				else {
					this.importLevel_old(nodes[i].children, createIn, false, links, feeds, feedsAs);
				}
			}
			else {
				if ((nodes[i].type == 'feed' || nodes[i].type == 'atom') && feeds){
					if (feedsAs == 'feeds'){
						BMSVC.createLivemarkInContainer(nodes[i].title, nodes[i].url, nodes[i].feedURL, nodes[i].desc, createIn, null);
					}
					else {
						BMSVC.createBookmarkInContainer(nodes[i].title, nodes[i].url,  nodes[i].keyword,  nodes[i].desc, null, null, createIn, null);
					}
				}
				else if ((nodes[i].type == 'link') && links) {
					BMSVC.createBookmarkInContainer(nodes[i].title, nodes[i].url,  nodes[i].keyword,  nodes[i].desc, null, null, createIn, null);
				}
			}
		}
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
	
	exportOPML_places : function () {
		// Show a dialog, allow the user to pick bookmarks or livemarks or all
		window.openDialog('chrome://opml-support/content/export-wizard.xul','export','chrome,centerscreen,modal');
	},
	
	doExportOPML : function (feeds, links, nested, feedMode) {
		var filePrefix = "livemarks";
		var title = "Livemarks";
		
		if (feeds && links) {
			filePrefix = "livemarks-and-bookmarks";
			title = "Livemarks and Bookmarks";
		}
		else if (links) {
			filePrefix = "bookmarks";
			title = "Bookmarks";
		}
		
		var file = this.promptForFile(filePrefix);
        
		if (file){
			var data = '';
			data += '<?xml version="1.0" encoding="UTF-8"?>' + "\n";
			data += '<opml version="1.0">' + "\n";
			data += "\t" + '<head>' + "\n";
			data += "\t\t" + '<title>' + title + ' OPML Export</title>' + "\n";
			data += "\t\t" + '<dateCreated>' + new Date().toString() + '</dateCreated>' + "\n";
			data += "\t" + '</head>' + "\n";
			data += "\t" + '<body>' + "\n";
			
			var livemarkService = Components.classes["@mozilla.org/browser/livemark-service;2"];
			
			if (livemarkService) {
				// FF3+
				this.doExportOPML_new(file, data, feeds, links, nested, feedMode);
			}
			else {
				this.doExportOPML_old(file, data, feeds, links, nested, feedMode);
			}
		}
		
		//this.reportAllTime();
	},
	
	doExportOPML_old : function (file, data, feeds, links, nested, feedMode) {
		var root = RDF.GetResource("NC:BookmarksRoot");
			
		data = this.addFolderToOPML(data, feeds, links, root, feedMode, 0, true, nested);
		
		data += "\t" + '</body>' + "\n";
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
	
	doExportOPML_new : function (file, data, feeds, links, nested, feedMode) {
		var level = 0;
		var annotationService = Components.classes["@mozilla.org/browser/annotation-service;1"].getService(Components.interfaces.nsIAnnotationService);
		var livemarkService = Components.classes["@mozilla.org/browser/livemark-service;2"].getService(Components.interfaces.nsILivemarkService);

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
						if ((type == "folder") && (!livemarkService.isLivemark(node.id))) {
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
								var xmlUrl = livemarkService.getFeedURI(id).spec;
								try { var url = livemarkService.getSiteURI(id).spec; } catch (e) { var url = xmlUrl; }
								var keyword = "";
							}
						
							if ((links && (type == 'bookmark')) || (feeds && (type == 'folder') && (feedMode == 'links'))) {
								// Bookmark or Livemark as a bookmark
								data += '<outline type="link" text="' + OPMLSUPPORT.cleanXMLText(title) + '" url ="' + OPMLSUPPORT.cleanXMLText(url) + '" description="'+OPMLSUPPORT.cleanXMLText(description)+'" keyword="'+OPMLSUPPORT.cleanXMLText(keyword)+'" />';
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
	
	addFolderToOPML : function (dataString, feeds, links, folder, feedMode, level, isBase, nested) {
		level++;
		
		if (!isBase && nested) {
			dataString += "\t";
			
			for (var i = 1; i < level; i++){
				dataString += "\t";
			}
			
			dataString += '<outline text="' + this.cleanXMLText(this.getField(folder, "Name")) + '">' + "\n";
		}
		
		RDFC.Init(BMDS, folder);

		var elements = RDFC.GetElements();
		
		while(elements.hasMoreElements()) {
			var element = elements.getNext();
			element.QueryInterface(Components.interfaces.nsIRDFResource);

			var type = BookmarksUtils.resolveType(element);
			if ((type == "Folder") || (type == "PersonalToolbarFolder")){
				dataString = this.addFolderToOPML(dataString, feeds, links, element, feedMode, level, false, nested);
			}
			else if ((type == 'Bookmark') || (type == 'Livemark')) {
				dataString += "\t\t";
				
				for (var i = 1; i < level; i++){
					dataString += "\t";
				}
				
				if ((links && (type == 'Bookmark')) || (feeds && (type == 'Livemark') && (feedMode == 'links'))){
					dataString += '<outline type="link" text="' + this.cleanXMLText(this.getField(element, "Name")) + '" url="' + this.cleanXMLText(this.getField(element, "URL")) + '" description="' + this.cleanXMLText(this.getField(element, "Description")) + '" keyword="'+this.cleanXMLText(this.getField(element, "ShortcutURL")) + '" />' + "\n";
				}
				else if (feeds && (type == 'Livemark')) {
					dataString += '<outline type="rss" version="RSS" text="' + this.cleanXMLText(this.getField(element, "Name")) + '" htmlUrl="' + this.cleanXMLText(this.getField(element, "URL")) + '" xmlUrl="' + this.cleanXMLText(this.getField(element, "FeedURL")) + '" description="' + this.cleanXMLText(this.getField(element, "Description")) + '"/>' + "\n";
				}
			}
		}
		
		if (!isBase && nested) {
			dataString += "\t";
			
			for (var i = 1; i < level; i++){
				dataString += "\t";
			}
			
			dataString += '</outline>' + "\n";
		}
		
		return dataString;
	},
		
	promptForFile : function (filePrefix) {
		var nsIFilePicker = Components.interfaces.nsIFilePicker;
		var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
		fp.init(window, this.strings.getString("saveAs"), nsIFilePicker.modeSave);
		
		fp.appendFilter(this.strings.getString("OPMLFiles"),"*.opml");
		fp.appendFilter(this.strings.getString("XMLFiles"),"*.opml; *.xml; *.rdf; *.html; *.htm");
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
		} catch (e) { alert(str + " " + e); }
		return str;
	},
	
	getField : function (e, field) {
		try {
			return BMDS.GetTarget(RDF.GetResource(e.Value), RDF.GetResource("http://home.netscape.com/NC-rdf#"+field), true).QueryInterface(kRDFLITIID).Value;
		} catch (e) {
			return '';
		}
	}
};

function opmllog(message){
	var consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
	consoleService.logStringMessage("OPML: " + message);
}