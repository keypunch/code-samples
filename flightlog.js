/*
	CODE SAMPLE NOTES:
		This was a project that was still heavily in development. (Hack it together state)
		It was for drone flight logging that could be loaded and used in an offline 
		environment using CouchDB & PouchDB. Unfortunately it was only barely 
		functional before I was pulled to another project. There is some, not very 
		good, code in here (IMO).
		I seemed to be playing with Typescript at the time, but I don't think there
		is any typescript in this file! Company specifics stripped.
		ERA: 2016
*/
/*
	TODO:
	WHEN UPDATING A RECORD WITHOUT CLICKING IT ON THE LIST
	IT DOES NOT GET THE NEWEST REVISION NUMBER
	-- UPDATE REVISION NUMBER WITHOUT CLICKING ANYTHING AFTER DOING A CHANGE
*/

"use strict";
 PouchDB.debug.enable('*');
// PouchDB.debug.disable();
// *** WARNING *** TODO: FIX GLOBAL VARIABLES
var rev;
var user = {
	name: 'privateUser',
	password: 'privatePass'
};
var pouchOpts = {
	skipSetup: true
};
var ajaxOpts = {
	ajax: {
		headers: {
			Authorization: 'Basic ' + window.btoa(user.name + ':' + user.password)
		}
	}
};

var localDB = new PouchDB("flightlog");
var remoteDB = new PouchDB("http://privateIP:5984/flightlog/", pouchOpts);

function addFilterIndex_sync() {
  var designDoc = {
    "_id": "_design/flightlog",
		"rev": "",
    "filters": {
      "by_pilot": function(doc, req) {
        return doc.pilot === req.query.pilot;
      }.toString()
    },
		"views": {
			"by_pilot": {
				"map": "function(doc) {\n  emit(null, doc);\n}"
			}
		}
  };
	remoteDB.get(designDoc._id).then(function (doc) {
		designDoc._rev = doc._rev;
		return remoteDB.put(designDoc);
  }).catch(function (err) {
    if (err.status != 409) {
      // some error (maybe a 409, because it already exists?)
      console.log("Add filter index error ", err.status, ": ", err);
    }
  });
}

function init() {
	remoteDB.login(user.name, user.password, ajaxOpts).then(function() {
		console.log("LOGGED IN");
	}).catch(function (err) {
		console.log(err);
	});
	// addFilterIndex_sync();
	// SYNC EM UP
	try {
		var sync = localDB.sync(remoteDB, {
			live: true,
			retry: true
			// filter: 'flightlog/by_pilot',
			// query_params: {'pilot': 'FName LName'}
		}).on('change', function(info) {
			console.log("Sync Changed: ", info);
			getCurrentPilot(); // INIT THE LIST ON CHANGE (OR SYNC)
			// updateSelected();
		}).on('paused', function (err) {
			console.log("Sync Paused: ", err);
		}).on('active', function(info) {
			console.log("Sync Resumed: ", info);
		}).on('denied', function(err) {
			console.log("Sync Denied: ", err);
		}).on('complete', function (err) {
			console.log("Sync Complete: ", info);
		}).on('error', function(err) {
			console.log("ERROR SYNCING: ", err);
			console.log((err.status));
		});
	}
	catch (err) {
		console.log("MAIN ERROR: ", err)
	}
	getCurrentPilot(); // INIT THE LIST ON PAGE LOAD
	$( "#pilot" ).change( function() { getCurrentPilot() }); // LISTEN FOR PILOT CHANGES AND PROCESS
}

// GET CURRENTLY SELECTED PILOT
function getCurrentPilot() {
	var currentPilot = $("#pilot").val()
	queryDbByPilot(currentPilot); // INITIAL CALL TO queryDbByPilot() TO GET DATA MATCHING PILOT
}

// QUERY THE DATA BASED ON CURRENTLY SELECTED PILOT
function queryDbByPilot(currentPilot) {
	localDB.query(function (doc) {
			emit(doc.pilot);
		}, {
			key: currentPilot,
			include_docs : true
		}).then(function (result) {

		if (result.rows.length != 0) {
			console.log(result.rows.length + " Rows Found");
			populateList(result.rows); // CALL populateList() TO POPULATE THE LIST WITH ENTRIES

		} else {
		$("#loglist").empty(); // CLEAR THE LIST IF NO ENTRIES
		}

	}).catch(function (err) {
		console.log(err);
	});
}

// POPULATE THE SELECTION LIST
function populateList(result) {
	$("#loglist").empty(); // CLEAR THE LIST FIRST

	$( "#loglist option:selected" ).each(function() {
		console.log("ITEM CHANGED");
	});

	for (var i = 0; i < result.length; i++) {
		var entryList = document.getElementById("loglist");
		var entryOption = document.createElement("option");
		entryOption.text = result[i].doc.date;
		entryOption.value = i; // OBJECT ROW NUMBER
		entryOption.id = result[i].doc._id; // OBJECT ID
		entryList.add(entryOption);
	}

	// LISTEN TO THE SELECTION LIST FOR CLICKS
	$( "#loglist" ).unbind().change(function() {
		var clickedItem = "";
		var clickedItem = result[this.value];
			$( "#loglist option:selected" ).each(function() {
				console.log("SELEcTED");
			})
		populateform(clickedItem); // CALL populateform() WITH THE NUMBER OF THE OBJECT
		return;
	});

}

// POPULATEFORM WILL TAKE AN OBJECT AND ASSIGN THE VALUES TO A FORM
function populateform(clickedItem) {
	console.log("The item is", clickedItem);

	$( "#log_id" ).val(clickedItem.doc._id);
	$( "#date" ).val(clickedItem.doc.date);
	$( "#pilot" ).val(clickedItem.doc.pilot);
	$( "#observer" ).val(clickedItem.doc.observer);
	$( "#area" ).val(clickedItem.doc.area);
	$( "#client" ).val(clickedItem.doc.client);
	$( "#location" ).val(clickedItem.doc.location);
	$( "#unit" ).val(clickedItem.doc.unit);
	$( "#bbxid" ).val(clickedItem.doc.bbxid);
	$( "#flightnum" ).val(clickedItem.doc.flightnum);
	$( "#flightnumtotal" ).val(clickedItem.doc.flightnumtotal);
	$( "#sensor" ).val(clickedItem.doc.sensor);
	$( "#takeofftime" ).val(clickedItem.doc.takeofftime);
	$( "#media" ).val(clickedItem.doc.media);
	$( "#batteryremaining" ).val(clickedItem.doc.batteryremaining);
	$( "#flighttime" ).val(clickedItem.doc.flighttime);
	$( "#notes" ).val(clickedItem.doc.notes);

	rev = clickedItem.doc._rev; // GLOBAL VARIABLE - SHOULD PROBABLY USE A HIDDEN FIELD OR LOCALSTORAGE INSTEAD
	console.log("rev = ", rev);

}

// ADDS A NEW RECORD OR UPDATES A CURRENTLY LISTED ONE
function addRecord() {
	var id = $("#log_id").val();
	localDB.get(id).catch(function(err) {
		console.log(err.status);
		if ((err.status) === 404) {
			id = "" + new Date(document.getElementById("date").value).toJSON() + Math.random();
			console.log("NO ID - Assigning '", id, "'");
			console.log("Nulling _rev");
			rev = ""
			// return {
			// 	_id: id
			// };
		} else{
			console.log("SOME OTHER ERROR");
		}
	}).then(function(doc) {
		console.log(rev);
		return localDB.put({
			_id: id,
			_rev: rev, // GLOBAL VARIABLE
			date: document.getElementById("date").value,
			pilot: document.getElementById("pilot").value,
			observer: document.getElementById("observer").value,
			area: document.getElementById("area").value,
			client: document.getElementById("client").value,
			location: document.getElementById("location").value,
			unit: document.getElementById("unit").value,
			bbxid: document.getElementById("bbxid").value,
			flightnum: document.getElementById("flightnum").value,
			flightnumtotal: document.getElementById("flightnumtotal").value,
			sensor: document.getElementById("sensor").value,
			takeofftime: document.getElementById("takeofftime").value,
			media: document.getElementById("media").value,
			batteryremaining: document.getElementById("batteryremaining").value,
			flighttime: document.getElementById("flighttime").value,
			notes: document.getElementById("notes").value,
		});
	}).then(function(response) {
		console.log("SAVE RESPONSE: ", response);
		// CALL THE WHOLE THING AGAIN TO UPDATE FORM
		// getCurrentPilot();
		console.log("NOW BACK");
		newFlight();
		saved();

		function saved() {
			$("#submit_id")
			.prop('disabled', true)
			.fadeOut(function() { $(this).val("SAVING!") })
				.fadeIn(500).fadeOut(500).fadeIn(500).fadeOut(500).fadeIn(500)
				.fadeOut(function() {
					$(this).val("Save Record")
					.prop('disabled', false)})
				.fadeIn(50);
		}

		// $("#loglist option:selected")
	}).catch(function(err) {
		console.log("PUT ERROR")
		console.log(err.status);
		console.log(err);
		if ((err.status) === 409) {
			console.log("THERE IS AN ERROR 409 (CONFLICT) - \
				SOMEONE ELSE MAY HAVE UPDATED THE RECORD \
				PLEASE UPDATE YOUR COPY");
		}
	});
}

function deleteRecord() {
	var id = $("#log_id").val();
	localDB.get(id).then(function (doc) {
		console.log("DELETING: ", doc);
		return localDB.remove(doc);
	}).then(function(response) {
		console.log("DELETE RESPONSE: ", response);
	}).catch(function (err) {
		console.log("Delete Error: ");
		console.log(err);
	});
}

// FOR TESTING ONLY
function deleteAllRecords() {
	var db = new PouchDB("_pouch_flightlog");
	console.log("Local database read");
	localDB.destroy()
		.then(function() {
			console.log("Local database destroyed");
		}).catch(function(error) {
			console.log(error);
		});
}

function newFlight() {
	document.getElementById("inputForm").reset();
}
