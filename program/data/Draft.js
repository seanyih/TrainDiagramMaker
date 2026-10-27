/*
	Drafts: copies of TRAINS changed by auto-fill (RunTimeAutofill.js), or by restoring passing times
	(PassingTime.js / PassingTimeSTN.js). A draft can be previewed, and replaces TRAINS only when adopted.
	It is valid only while ROUTE and TRAINS are unchanged since it was made.
*/

const DRAFTS = { autofill: null, passing: null };

function dataFingerprint(){
	return JSON.stringify([ROUTE, TRAINS]);
}

function newDraft(){
	return { trains: structuredClone(TRAINS), fingerprint: dataFingerprint() };
}

// the draft, or null if there is none or it is outdated (then it is dropped)
function validDraft(name){
	if(DRAFTS[name] && DRAFTS[name].fingerprint != dataFingerprint()) DRAFTS[name] = null;
	return DRAFTS[name];
}

function adoptDraft(name){
	TRAINS[1] = DRAFTS[name].trains[1];
	TRAINS[2] = DRAFTS[name].trains[2];
	DRAFTS[name] = null;
	refreshTimetable(1);
	refreshTimetable(2);
}
