/*
	Overlay: the trains of a section of this route, exported with a time at every station they pass (as drawn, to the
	second), then laid onto another route sharing those stations. Stations are matched by name, trains by train
	number (or, without one, by an equal time at a shared station), so a train already on the other route is merged
	instead of added twice. The overlaid times are pinned: the passing time solvers never move them.
	See DATA_STRUCTURE.md 5.5.
*/

const OVERLAY_TYPE = "rtd-overlay";

/*
	Times of a train at every station of its bound from its first drawn point to its last: { order: { arr, dep, stop } }
	in seconds (unwrapped like stopTimes()), stop = its timetable stop or junction stop, null where it only passes
	(on the straight line between the points around it, as drawDiagram() draws it).
*/
function trainTimesAt(train, bound){
	const stations = boundStations(bound);
	const junction = junctionStops(train, bound);
	const points = [junction.origin, ...stopTimes(train, stations), junction.terminal].filter(Boolean)
		.map(p => p.k === undefined
			? { order: p.order, arr: p.arr, dep: p.dep, stop: findStop(train, p.order) }
			: { order: p.k, arr: p.time, dep: p.time, stop: p.stop });
	const times = {};
	points.forEach((p, i) => {
		times[p.order] = p;
		if(i == 0) return;
		const q = points[i - 1];
		const [kq, kp] = [stations[q.order].kilo, stations[p.order].kilo];
		for(let k = q.order + 1; k < p.order; k++){
			const time = q.dep + (p.arr - q.dep)*Math.abs(stations[k].kilo - kq)/Math.abs(kp - kq);
			times[k] = { order: k, arr: time, dep: time, stop: null };
		}
	});
	return times;
}

// wall-clock "hhmm(ss)" of seconds, to the second
function overlayTime(sec){
	return toStr(((Math.round(sec) % 86400) + 86400) % 86400);
}

/*
	The overlay JSON of route stations from..to (route indices, from < to): every train with times at two or more of
	them, its stops in its direction of travel; direction 1 = along `stations`, 2 = against.
	A timetable stop keeps its arrival / departure strings (a blank arrival stays blank); elsewhere (passing, junction
	stops, the straight line between stops) arrival = departure = the drawn time.
*/
function getOverlayJSON(from, to){
	const count = ROUTE.stations.length;
	const trains = [];
	[1, 2].forEach(bound => {
		TRAINS[bound].forEach(train => {
			const times = trainTimesAt(train, bound);
			const stops = Object.values(times)
				.map(p => ({ p: p, r: (bound == 1) ? p.order : count - 1 - p.order }))
				.filter(({ r }) => r >= from && r <= to)
				.sort((a, b) => a.p.order - b.p.order)
				.map(({ p }) => {
					const own = p.stop && p.stop.station_order === p.order && train.timetable.includes(p.stop);
					return {
						station_name: boundStations(bound)[p.order].name,
						arrival: own ? p.stop.arrival : overlayTime(p.arr),
						departure: own ? p.stop.departure : overlayTime(p.dep),
						passing: !own || isPassingStop(p.stop)
					};
				});
			if(stops.length < 2) return;
			trains.push({
				train_number: train.train_number,
				settings: structuredClone(train.settings),
				direction: bound,
				stops: stops
			});
		});
	});
	return {
		type: OVERLAY_TYPE,
		version: 1,
		route_name: ROUTE.route_name,
		stations: ROUTE.stations.slice(from, to + 1).map(s => ({ name: s.name, kilo: s.kilo })),
		train_count: trains.length,
		trains: trains
	};
}

/*
	Lay an overlay onto this route. conflict = "overlay": its times replace the ones already there,
	"keep": stations that already have times keep them. Returns { merged, added, skipped, stations: [unmatched names] },
	or throws an Error with a message for the user.
*/
function applyOverlay(data, conflict = "overlay"){
	if(data?.type != OVERLAY_TYPE || !Array.isArray(data.stations) || !Array.isArray(data.trains)) throw new Error("不是疊圖檔案");
	const count = ROUTE.stations.length;
	const index = new Map();
	ROUTE.stations.forEach((s, r) => { if(s.name && !index.has(s.name)) index.set(s.name, r); });
	const matched = data.stations.map(s => index.get(s.name)).filter(r => r !== undefined);
	if(matched.length < 2) throw new Error("疊圖的車站與本路線相同的不到兩站");
	const ascending = matched.every((r, i) => i == 0 || r > matched[i - 1]);
	const descending = matched.every((r, i) => i == 0 || r < matched[i - 1]);
	if(!ascending && !descending) throw new Error("疊圖車站在本路線的順序不一致");

	const branchNames = new Set([1, 2].flatMap(b => branchStations(b).map(s => s.name)));
	const result = { merged: 0, added: 0, skipped: 0, stations: data.stations.map(s => s.name).filter(n => !index.has(n)) };

	data.trains.forEach(ot => {
		const stops = (ot.stops ?? [])
			.map(s => ({ ...s, r: index.get(s.station_name),
				arrival: normalizeTime(String(s.arrival ?? "")) || "", departure: normalizeTime(String(s.departure ?? "")) || "" }))
			.filter(s => s.departure || s.arrival);
		const onRoute = stops.filter(s => s.r !== undefined);
		if(onRoute.length == 0){
			result.skipped++;
			return;
		}
		// bound: the order of its stations on this route (one station: the overlay's direction and orientation)
		const forward = (onRoute.length >= 2) ? onRoute[1].r > onRoute[0].r : ((ot.direction ?? 1) == 1) == ascending;
		const bound = forward ? 1 : 2;
		const orderOf = r => (bound == 1) ? r : count - 1 - r;

		let train = findOverlayTrain(ot, onRoute, bound, orderOf);
		if(!train){
			if(onRoute.length < 2){
				result.skipped++;
				return;
			}
			train = newTrain(ot.train_number ?? "", ot.settings?.train_name ?? "", parseInt(ot.settings?.train_color) || 0);
			TRAINS[bound].push(train);
			result.added++;
		}else{
			result.merged++;
		}

		onRoute.forEach(s => {
			const order = orderOf(s.r);
			const stop = findStop(train, order);
			if(stop && conflict == "keep") return;
			if(stop){
				// a blank in the overlay is not known there either: keep what is here
				stop.arrival = s.arrival || stop.arrival;
				stop.departure = s.departure || stop.departure || s.arrival;
				stop.pinned = true;
			}else{
				const next = train.timetable.findIndex(x => x.station_order > order);
				const added = { station_order: order, station_name: ROUTE.stations[s.r].name, arrival: s.arrival,
					departure: s.departure || s.arrival, pinned: true };
				train.timetable.splice(next == -1 ? train.timetable.length : next, 0, added);
			}
		});

		// stations off this route around it that are branch stations here: origin / terminal, if not set yet
		const first = stops.indexOf(onRoute[0]);
		const last = stops.indexOf(onRoute[onRoute.length - 1]);
		const before = stops.slice(0, first).reverse().find(s => branchNames.has(s.station_name) && s.departure);
		const after = stops.slice(last + 1).find(s => branchNames.has(s.station_name) && (s.arrival || s.departure));
		if(before && !train.origin.station_name) train.origin = { station_name: before.station_name, departure: before.departure };
		if(after && !train.terminal.station_name) train.terminal = { station_name: after.station_name, arrival: after.arrival || after.departure };
	});
	refreshStopNames();
	return result;
}

/*
	The train of this route an overlay train is: the same train number (the nearest in time if there are several);
	without a number, one with the same time at a shared station. null if none.
*/
function findOverlayTrain(ot, onRoute, bound, orderOf){
	const sameTime = train => onRoute.some(s => {
		const stop = findStop(train, orderOf(s.r));
		return stop && ((s.departure && stop.departure == s.departure) || (s.arrival && stop.arrival == s.arrival));
	});
	if(!ot.train_number) return TRAINS[bound].find(train => !train.train_number && sameTime(train)) ?? null;

	const candidates = TRAINS[bound].filter(train => train.train_number == ot.train_number);
	if(candidates.length <= 1) return candidates[0] ?? null;
	// the one whose times are nearest: by the first time on this route, within a day
	const at = toSec(onRoute[0].departure || onRoute[0].arrival);
	const distance = train => {
		const times = stopTimes(train, boundStations(bound));
		if(times.length == 0) return Infinity;
		const d = Math.abs(((times[0].dep % 86400) - at + 86400 + 43200) % 86400 - 43200);
		return sameTime(train) ? -1 : d;
	};
	return candidates.reduce((best, train) => distance(train) < distance(best) ? train : best);
}

// unpin all stops of a train
function unpinTrain(train){
	train.timetable.forEach(stop => delete stop.pinned);
}
