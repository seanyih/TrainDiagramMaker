/*
	Single source of truth for route and train data.
	Tables are rendered from here, edits write back here, and graphing / export read from here.
	See DATA_STRUCTURE.md for the format.
*/

const DEFAULT_TRACK = "quadruple";
const MAX_BRANCHES = 3; // per station

const ROUTE = {
	route_name: "",
	stations: [newStation(), newStation()],
	track_layout: newTrackLayout(2),
	topology: newTopology(2)
};
ROUTE.stations[0].kilo = 0;

// key = bound, value = array of train objects (same as "timetable" in train JSON)
const TRAINS = {
	1: [newTrain(), newTrain()],
	2: [newTrain(), newTrain()]
};

function newStation(name = "", kilo = null, stopsec = SETTINGS.defaultStopSec, alias = ""){
	return { name: name, kilo: kilo, stopsec: stopsec, alias: alias };
}

// track type of each station and of each section between adjacent stations (see TrackLayout.js),
// and max speed (km/h, null = not set) of each section
function newTrackLayout(count){
	return {
		stations: Array(count).fill(DEFAULT_TRACK),
		sections: Array(count - 1).fill(DEFAULT_TRACK),
		max_speed_enabled: true,
		max_speed_all: null,
		max_speeds: Array(count - 1).fill(null)
	};
}

// secondary stations (never the first or last one), and the branch lines diverging at each station, left to right
function newTopology(count){
	return {
		secondary: Array(count).fill(false),
		branches: Array.from({ length: count }, () => [])
	};
}

// kilo: from the station the branch diverges at
function newBranchStation(name = "", kilo = null){
	return { name: name, kilo: kilo };
}

// nearest first; blank kilos last
function sortBranchStations(branch){
	branch.stations.sort((a, b) => (a.kilo ?? Infinity) - (b.kilo ?? Infinity));
}

function newTrain(train_number = "", train_name = "", train_color = 0){
	return {
		train_number: train_number,
		settings: {
			train_name: train_name,
			train_color: train_color
		},
		// a branch station the train comes from / goes to (ROUTE.topology), "" = none
		origin: { station_name: "", departure: "" },
		terminal: { station_name: "", arrival: "" },
		timetable: []
	};
}

// stations in the order of the given bound (bound 2 is reversed)
function boundStations(bound){
	return (bound == 1) ? ROUTE.stations : ROUTE.stations.slice().reverse();
}

function findStop(train, order){
	return train.timetable.find(stop => stop.station_order == order);
}

// append a stop; callers add stops in station order
function addStop(train, order, arrival, departure){
	if(!arrival && !departure) return;
	train.timetable.push({ station_order: order, station_name: "", arrival: arrival, departure: departure });
}

function setStopTime(bound, trainIndex, order, field, time){
	const train = TRAINS[bound][trainIndex];
	let stop = findStop(train, order);

	if(!stop){
		if(!time) return;
		stop = { station_order: order, station_name: boundStations(bound)[order].name, arrival: "", departure: "" };
		const next = train.timetable.findIndex(s => s.station_order > order);
		train.timetable.splice(next == -1 ? train.timetable.length : next, 0, stop);
	}

	stop[field] = time;
	if(!stop.arrival && !stop.departure){
		train.timetable.splice(train.timetable.indexOf(stop), 1);
	}
}

// arrival time of a stop with a departure; a blank one is departure - the station's stopsec (stations of its bound)
function arrivalTime(stop, stations){
	return stop.arrival || deductSec(tohhmmss(stop.departure), stations[stop.station_order].stopsec);
}

// stops with a departure (the drawn ones) in seconds, kept non-decreasing past midnight; stations of the train's bound
function stopTimes(train, stations){
	let day = 0;
	let prev = -Infinity;
	const sec = str => {
		let time = toSec(str) + day;
		while(time < prev){
			day += 86400;
			time += 86400;
		}
		return prev = time;
	};
	return train.timetable
		.filter(stop => stop.departure && stop.station_order < stations.length)
		.map(stop => ({ order: stop.station_order, arr: sec(arrivalTime(stop, stations)), dep: sec(stop.departure) }));
}

function isBlankTrain(train){
	return !train.train_number && train.timetable.length == 0;
}

// shift station_order of stops at or after `order` by `delta`
function shiftStops(bound, order, delta){
	TRAINS[bound].forEach(train => {
		train.timetable.forEach(stop => {
			if(stop.station_order >= order) stop.station_order += delta;
		});
	});
}

function insertStation(index){
	const count = ROUTE.stations.length;
	ROUTE.stations.splice(index, 0, newStation());
	shiftStops(1, index, 1);
	shiftStops(2, count - index, 1);

	// copy the station above and the section being split (the last section when appended)
	const layout = ROUTE.track_layout;
	layout.stations.splice(index, 0, layout.stations[index - 1]);
	layout.sections.splice(index - 1, 0, layout.sections[Math.min(index, count - 1) - 1] ?? DEFAULT_TRACK);
	layout.max_speeds.splice(index - 1, 0, layout.max_speeds[Math.min(index, count - 1) - 1] ?? null);

	ROUTE.topology.secondary.splice(index, 0, false);
	ROUTE.topology.branches.splice(index, 0, []);
}

function deleteStation(index){
	const count = ROUTE.stations.length;
	const order2 = count - 1 - index;
	ROUTE.stations.splice(index, 1);

	TRAINS[1].forEach(train => train.timetable = train.timetable.filter(stop => stop.station_order != index));
	TRAINS[2].forEach(train => train.timetable = train.timetable.filter(stop => stop.station_order != order2));
	shiftStops(1, index + 1, -1);
	shiftStops(2, order2 + 1, -1);

	// the two sections around the station merge into the one above
	ROUTE.track_layout.stations.splice(index, 1);
	ROUTE.track_layout.sections.splice(Math.min(index, count - 2), 1);
	ROUTE.track_layout.max_speeds.splice(Math.min(index, count - 2), 1);

	ROUTE.topology.secondary.splice(index, 1);
	ROUTE.topology.branches.splice(index, 1);
	ROUTE.topology.secondary[count - 2] = false; // the last station
}

function refreshStopNames(){
	[1, 2].forEach(bound => {
		const stations = boundStations(bound);
		TRAINS[bound].forEach(train => {
			train.timetable.forEach(stop => {
				if(stations[stop.station_order]) stop.station_name = stations[stop.station_order].name;
			});
		});
	});
}
