/*
	Trains coming from / going to a branch (train.origin / train.terminal, a station of ROUTE.topology.branches).
	Where the branch joins the route, the train passes at the time interpolated by distance between the branch station
	and its first (last) stop on the route: a junction stop, drawn but not saved in the timetable.
*/

// branch stations: name, the station order of bound where its branch joins, kilo from there
function branchStations(bound){
	const last = ROUTE.stations.length - 1;
	return ROUTE.topology.branches.flatMap((branches, r) => branches.flatMap(branch => branch.stations
		.filter(s => s.name)
		.map(s => ({ name: s.name, order: (bound == 1) ? r : last - r, kilo: s.kilo }))));
}

// branch stations joining at or before the train's first stop (origin) / at or after its last stop (terminal)
function branchChoices(train, bound, end){
	const orders = train.timetable.filter(stop => stop.departure).map(stop => stop.station_order);
	return branchStations(bound).filter(s => (end == "origin")
		? s.order <= (orders[0] ?? Infinity)
		: s.order >= (orders[orders.length - 1] ?? -Infinity));
}

/*
	[earliest, latest] time at a junction between a (time at A) and c (time at C), d1 km from A and d2 from C:
	the average speeds before and after it differ by at most interpolationSpeedRatio, or it is within
	interpolationMaxError of the interpolation if that is set
*/
function junctionRange(a, c, d1, d2){
	const { interpolationSpeedRatio: ratio, interpolationMaxError: error } = SETTINGS.passingTime;
	const run = c - a;
	if(error !== null){
		const time = a + run*d1/(d1 + d2);
		return [Math.max(time - error, a), Math.min(time + error, c)];
	}
	return [a + run*d1/(d1 + ratio*d2), a + run*ratio*d1/(ratio*d1 + d2)];
}

/*
	Junction stops of a train, { origin, terminal } (null where there is none): { k (station order), time, min, max },
	in seconds like stopTimes(), and `stop`, a passing stop like the ones in the timetable.
	Only where the branch joins before the first (after the last) stop, so the time is not known yet.
*/
function junctionStops(train, bound){
	const stations = boundStations(bound);
	const stops = stopTimes(train, stations);
	const result = { origin: null, terminal: null };
	if(stops.length == 0) return result;

	const junction = (end, s, stop, timeStr, before) => {
		const branch = branchChoices(train, bound, end).find(b => b.name == s.station_name && b.order != stop.order);
		const kilo = branch && stations[branch.order].kilo;
		if(!branch || !timeStr || branch.kilo === null || kilo === null || stations[stop.order].kilo === null) return null;
		const route = Math.abs(stations[stop.order].kilo - kilo);
		let other = toSec(timeStr);
		// the branch station is on the other side of the junction, also past midnight
		if(before) while(other > stop.arr) other -= 86400;
		else       while(other < stop.dep) other += 86400;
		const [a, c, d1, d2] = before ? [other, stop.arr, branch.kilo, route] : [stop.dep, other, route, branch.kilo];
		const time = a + (c - a)*d1/(d1 + d2);
		const [min, max] = junctionRange(a, c, d1, d2);
		const str = toStr(((Math.round(time) % 86400) + 86400) % 86400);
		return { k: branch.order, time: time, min: min, max: max,
			stop: { station_order: branch.order, station_name: stations[branch.order].name, arrival: str, departure: str } };
	};
	result.origin = junction("origin", train.origin, stops[0], train.origin.departure, true);
	result.terminal = junction("terminal", train.terminal, stops[stops.length - 1], train.terminal.arrival, false);
	return result;
}

// the timetable with the junction stops
function trainStops(train, bound){
	const { origin, terminal } = junctionStops(train, bound);
	return [origin?.stop, ...train.timetable, terminal?.stop].filter(Boolean);
}
