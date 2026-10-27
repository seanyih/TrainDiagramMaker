/*
	Restoring passing times with the track layout.
	Between two known times a train is a straight line, so a fast train may seem to overtake another one
	(or to meet one on single track) where the track layout does not allow it: a conflict.
	A conflict is solved by letting one train pass a nearby station while the other one waits there (a long stop,
	or where it starts / ends): minTimeSeparation before the waiting train leaves, or else after it arrives.
	Trains passing during the same wait are kept minTimeSeparation apart, moving the ones in the way if needed,
	and up to maxPassingPointIncrease more passing times of the same train may solve the conflicts it then causes.
	This is kept only if it keeps to the max speeds (estimated where not set), solves the conflict and leaves
	fewer conflicts among the trains it changes. Conflicts are found again after every round.

	Fine-tuning (`headway`): two trains of a bound arriving at or leaving a station less than minTimeSeparation apart
	count too, as a lighter conflict, solved (`tune`) by moving the passing time of one of them there, after the other
	conflicts: a passing time chosen for a conflict while keeping every headway in mind leaves too little room.
	Passing times already in the timetable may then move as well.

	Arrival times that are not known (inaccurateArrival, or blank) are loose: they start at
	departure - stopsec, or earlier after a run much longer than the golden one (inferArrivals()), and may move up to
	their earliest arrival, so a train may wait there.
	Where a stop rule (stopRules) allows it, a train with no stop at a station may stop there to wait (a temporary stop,
	e.g. at a signal station): a moving point whose arrival and departure differ.
	Imprecise timetables (`rounding`: the times were rounded to timetableGranularity) have vague stops instead: every time
	may be anywhere it was rounded from, and each stop lasts at least minDwell, even one that looks like passing.

	Model: the times of a train at every station of its range (interpolated between known times),
	indexed by the station order of its bound. Elements are the stations (2r) and sections (2r + 1) in route order.
	New passing times are on the grid of timeGranularity.
*/

// how bad two trains are together: too close (when fine-tuning), or a conflict, which outweighs any number of those
const HEADWAY = 1;
const CONFLICT = 1e6;

// rounding: "round" | "floor" | "ceil" for an imprecise timetable, else null
function createPassingModel(trains, headway, rounding = null){
	const { minExtraPassingWaiting, minTimeSeparation, estimatedSpeedLimitRatio, timeGranularity, inaccurateArrival, stopRules,
		timetableGranularity, minDwell } = SETTINGS.passingTime;
	const count = ROUTE.stations.length;
	const kilos = ROUTE.stations.map(station => station.kilo);
	const stopsecs = ROUTE.stations.map(station => station.stopsec);
	const layout = ROUTE.track_layout;
	const m = {
		count: count,
		kms: { 1: kilos, 2: kilos.slice().reverse() },
		stopsecs: { 1: stopsecs, 2: stopsecs.slice().reverse() },
		headway: headway,
		tune: false,
		gap: minTimeSeparation,
		grid: timeGranularity,
		rounding: rounding,
		precision: Math.max(timetableGranularity, timeGranularity),
		minDwell: minDwell,
		tracks: [],
		runPrefix: [0],  // route order: min running time from the first station
		overtakes: [],   // per element: [a, b] found by the last detection
		trains: []
	};
	for(let r = 0; r < count; r++){
		m.tracks.push(parseTrack(layout.stations[r]));
		if(r < count - 1) m.tracks.push(parseTrack(layout.sections[r]));
	}
	m.present = m.tracks.map(() => ({ 1: [], 2: [] }));

	[1, 2].forEach(bound => {
		const stations = boundStations(bound);
		trains[bound].forEach(train => {
			const stops = stopTimes(train, stations);
			if(stops.length < 2) return;
			const t = {
				id: m.trains.length,
				bound: bound,
				train: train,
				first: stops[0].order,
				last: stops[stops.length - 1].order,
				arr: new Float64Array(count),
				dep: new Float64Array(count),
				fixed: new Uint8Array(count),        // 1 = stop, 2 = passing time that may move
				free: new Uint8Array(count).fill(1), // a passing time may be set: no stop, or one that may move
				wait: new Uint8Array(count),         // a stop long enough to be overtaken / met there
				loose: new Uint8Array(count),        // a stop whose arrival is not known, so it may move
				early: new Float64Array(count),      // the earliest arrival there, if loose
				stopOk: new Uint8Array(count),       // a stop rule allows a temporary stop there
				temp: new Uint8Array(count),         // a passing time that is a temporary stop (fixed == 2)
				vague: new Uint8Array(count),        // a stop of an imprecise timetable: arrival within [early, arrMax],
				arrMax: new Float64Array(count),     // departure within [depMin, depMax]
				depMin: new Float64Array(count),
				depMax: new Float64Array(count)
			};
			const rules = stopRules.filter(rule => stopRuleTrain(rule, bound, train));
			for(let k = 0; k < count; k++){
				if(rules.some(rule => stopRuleStation(rule, bound, routeIndex(m, bound, k)))) t.stopOk[k] = 1;
			}
			train.timetable.forEach(stop => t.free[stop.station_order] = 0);
			stops.forEach((stop, i) => {
				const k = stop.order;
				if(rounding){
					vagueStop(m, t, stop, i == 0, i == stops.length - 1);
				}else if(i > 0 && stop.arr != stop.dep && (inaccurateArrival || !findStop(train, k).arrival)){
					t.loose[k] = 1;
					stop.arr = stop.dep - m.stopsecs[bound][k];
				}
				t.arr[k] = stop.arr;
				t.dep[k] = stop.dep;
				t.fixed[k] = 1;
				if(i == 0) return;
				interpolate(m, t, stops[i - 1].order, k);
				if(i == stops.length - 1) return;
				if((t.vague[k] ? t.depMax[k] - t.early[k] : stop.dep - stop.arr) > stations[k].stopsec + minExtraPassingWaiting) t.wait[k] = 1;
				// fine-tuning may move the passing times in the timetable too
				if(headway && stop.dep == stop.arr && !rounding){
					t.fixed[k] = 2;
					t.free[k] = 1;
				}
			});
			t.stops = stopOrders(t);
			for(let k = t.first; k <= t.last; k++){
				m.present[stationElement(m, bound, k)][bound].push(t);
				if(k < t.last) m.present[sectionElement(m, bound, k)][bound].push(t);
			}
			m.trains.push(t);
		});
	});

	m.golden = inferArrivals(m);

	// km/s of the fastest run between two stops through each section; passing times are left out,
	// so that passing times restored before do not raise the estimate
	const fastest = new Float64Array(count - 1);
	m.trains.forEach(t => {
		const kms = m.kms[t.bound];
		for(let p = t.first, q = p + 1; q <= t.last; q++){
			if(!t.fixed[q] || (t.arr[q] == t.dep[q] && q != t.last)) continue;
			const speed = Math.abs(kms[q] - kms[p])/(t.arr[q] - t.dep[p]);
			for(let k = p; k < q; k++){
				const i = (t.bound == 1) ? k : count - 2 - k;
				fastest[i] = Math.max(fastest[i], speed);
			}
			p = q;
		}
	});
	for(let i = 0; i < count - 1; i++){
		const estimated = (fastest[i] > 0) ? (kilos[i + 1] - kilos[i])/(fastest[i]*estimatedSpeedLimitRatio) : 0;
		m.runPrefix.push(m.runPrefix[i] + (minRunSec(i) ?? estimated));
	}
	looseArrivals(m, m.golden);
	return m;
}

// whether a train of `bound` is one of a stop rule's trains
function stopRuleTrain(rule, bound, train){
	return (rule.bound == 0 || rule.bound == bound)
		&& (rule.number === null || wildcardRegExp(rule.number).test(train.train_number))
		&& (rule.color === null || train.settings.train_color == rule.color)
		&& (rule.name === null || wildcardRegExp(rule.name).test(train.settings.train_name));
}

// whether a stop rule allows a temporary stop at route station r for `bound` (3: either)
function stopRuleStation(rule, bound, r){
	const { lines, bits } = parseTrack(ROUTE.track_layout.stations[r]);
	if(rule.stations == "cross") return lines >= 2;
	if(rule.stations == "overtake") return !!(bits & bound);
	if(rule.stations == "station") return ROUTE.stations[r].name == rule.station;
	return true;
}

// s; a train stopping once more runs this much slower (braking and starting again)
const STOP_LOSS = 60;

/*
	Where a temporary stop of t at its order k would naturally be: arriving from its known time before and leaving
	towards the one after at the pace of the golden run between its stops around k (else at the max speeds),
	STOP_LOSS / 2 slower each way. [arrival, departure], around where it is now.
*/
function tempStopTimes(m, t, k){
	const [p, q] = knownAround(t, k);
	const kms = m.kms[t.bound];
	const a = t.stops.findLast(order => order < k);
	const b = t.stops.find(order => order > k);
	const golden = m.golden.get(goldenKey(m, t, a, b, false)) ?? m.golden.get(goldenKey(m, t, a, b, true));
	const run = (i, j) => (golden === undefined) ? minRun(m, t, i, j) : golden*Math.abs(kms[j] - kms[i])/Math.abs(kms[b] - kms[a]);
	return [Math.min(t.dep[p] + run(p, k) + STOP_LOSS/2, t.arr[k]), Math.max(t.arr[q] - run(k, q) - STOP_LOSS/2, t.dep[k])];
}

// whether t may stop at its station order k for a while: allowed by a stop rule, no stop of its own there, not an end
function canStop(t, k){
	return t.stopOk[k] && t.free[k] && k > t.first && k < t.last;
}

// [earliest, latest] on the grid of where a time rounded to m.precision was
function roundedFrom(m, time){
	const from = { round: time - m.precision/2, floor: time, ceil: time - m.precision }[m.rounding];
	// [from, from + precision), or (from, from + precision] when rounded up
	if(m.rounding == "ceil") return [alignDown(m, from) + m.grid, alignDown(m, from + m.precision)];
	return [alignUp(m, from), alignUp(m, from + m.precision) - m.grid];
}

// the shortest stop of t at its vague stop k: minDwell, or as long as its times allow; none where it starts or ends
function dwellOf(m, t, k){
	return (k == t.first || k == t.last) ? 0 : Math.min(alignUp(m, m.minDwell), t.depMax[k] - t.early[k]);
}

// a stop of an imprecise timetable (stop.arr / stop.dep in seconds, changed to where it starts: the middle of both times,
// spread to dwellOf())
function vagueStop(m, t, stop, first, last){
	const k = stop.order;
	t.vague[k] = 1;
	[t.early[k], t.arrMax[k]] = roundedFrom(m, stop.arr);
	[t.depMin[k], t.depMax[k]] = roundedFrom(m, stop.dep);
	let arr = alignDown(m, (t.early[k] + t.arrMax[k])/2);
	let dep = alignUp(m, (t.depMin[k] + t.depMax[k])/2);
	const dwell = dwellOf(m, t, k);
	if(dep - arr < dwell){
		arr = Math.min(Math.max(alignDown(m, (arr + dep - dwell)/2), t.early[k], t.depMin[k] - dwell), t.arrMax[k], t.depMax[k] - dwell);
		dep = Math.max(arr + dwell, t.depMin[k]);
	}
	stop.arr = first ? Math.min(arr, dep) : arr;
	stop.dep = last ? Math.max(arr, dep) : dep;
}

// whether t's arrival at its stop k may move (earliest at t.early[k]); not where it starts
function movesArrival(t, k){
	return (t.loose[k] || t.vague[k]) && k != t.first;
}

// sum over each two stops in a row of the standard deviation of the trains' running times between them (by bound)
function runTimeSpread(m){
	const runs = new Map();
	m.trains.forEach(t => {
		const orders = stopOrders(t);
		orders.slice(1).forEach((b, i) => {
			const key = goldenKey(m, t, orders[i], b, false);
			if(!runs.has(key)) runs.set(key, []);
			runs.get(key).push(t.arr[b] - t.dep[orders[i]]);
		});
	});
	let spread = 0;
	runs.forEach(list => {
		const mean = list.reduce((sum, run) => sum + run, 0)/list.length;
		spread += Math.sqrt(list.reduce((sum, run) => sum + (run - mean)**2, 0)/list.length);
	});
	return spread;
}

// orders of t's stops: its known times except the passing times
function stopOrders(t){
	const orders = [];
	for(let k = t.first; k <= t.last; k++){
		if(t.fixed[k] && (k == t.first || k == t.last || t.arr[k] != t.dep[k])) orders.push(k);
	}
	return orders;
}

// s; passenger timetables are in minutes, so runs between the same stops differ by this much anyway
const TIMETABLE_ROUNDING = 60;

// golden runs between t's stops a and b, of its bound or (both) of both bounds
function goldenKey(m, t, a, b, both){
	if(!both) return `${t.bound}:${a}:${b}`;
	const ra = routeIndex(m, t.bound, a), rb = routeIndex(m, t.bound, b);
	return `${Math.min(ra, rb)}:${Math.max(ra, rb)}`;
}

/*
	A run of a train between two stops with no conflict of it there is likely a normal one (no waiting);
	the shortest of those between the same two stops is the golden run. A loose arrival after a run longer
	than that by more than minExtraPassingWaiting (+ TIMETABLE_ROUNDING) moves up to it: the train likely arrived
	early to wait, rather than ran slower (not where it ends).
	Returns the golden runs (s) by goldenKey().
*/
function inferArrivals(m){
	const golden = new Map();
	// per train: 1 at each station (2k) and section (2k + 1) of its bound with a conflict of it
	const marks = new Map();
	detectConflicts(m).forEach(c => {
		if(c.type == "headway") return;
		[c.a, c.b].forEach(t => {
			if(!marks.has(t)) marks.set(t, new Uint8Array(2*m.count));
			marks.get(t)[2*elementOrder(m, t.bound, c.e) + c.e % 2] = 1;
		});
	});
	const runs = t => {
		const orders = stopOrders(t);
		return orders.slice(1).map((b, i) => [orders[i], b]);
	};
	m.trains.forEach(t => runs(t).forEach(([a, b]) => {
		if(marks.get(t)?.subarray(2*a + 1, 2*b + 1).includes(1)) return;
		[false, true].forEach(both => {
			const key = goldenKey(m, t, a, b, both);
			golden.set(key, Math.min(golden.get(key) ?? Infinity, t.arr[b] - t.dep[a]));
		});
	}));
	m.trains.forEach(t => runs(t).forEach(([a, b]) => {
		const run = golden.get(goldenKey(m, t, a, b, false));
		if(!t.loose[b] || b == t.last || run === undefined || t.arr[b] - t.dep[a] - run <= SETTINGS.passingTime.minExtraPassingWaiting + TIMETABLE_ROUNDING) return;
		t.arr[b] = Math.min(alignUp(m, t.dep[a] + run), t.arr[b]);
		let p = b - 1;
		while(!t.fixed[p]) p--;
		interpolate(m, t, p, b);
	}));
	return golden;
}

// the earliest arrival of each loose one: after the golden run of either bound (a bound may run slower between two
// stations everywhere), else the min running time, from the stop before; it is a possible wait if the stop may then be long enough
function looseArrivals(m, golden){
	const { minExtraPassingWaiting } = SETTINGS.passingTime;
	m.trains.forEach(t => {
		const orders = stopOrders(t);
		orders.forEach((b, i) => {
			if(!t.loose[b]) return;
			const a = orders[i - 1];
			t.early[b] = Math.min(alignUp(m, t.dep[a] + (golden.get(goldenKey(m, t, a, b, true)) ?? minRun(m, t, a, b))), t.arr[b]);
			if(b != t.last && t.dep[b] - t.early[b] > m.stopsecs[t.bound][b] + minExtraPassingWaiting) t.wait[b] = 1;
		});
	});
}

// the earliest arrival of t at its loose stop k, also within the min running time from its known time before
function earliestArrival(m, t, k){
	let p = k - 1;
	while(!t.fixed[p]) p--;
	return Math.max(t.early[k], t.dep[p] + minRun(m, t, p, k));
}

// station order of a bound <-> route index
function routeIndex(m, bound, k){
	return (bound == 1) ? k : m.count - 1 - k;
}

function stationElement(m, bound, k){
	return 2*routeIndex(m, bound, k);
}

// the section from station order k to k + 1
function sectionElement(m, bound, k){
	return (bound == 1) ? 2*k + 1 : 2*(m.count - 2 - k) + 1;
}

// station order of an element's station, or of the station a section is entered from
function elementOrder(m, bound, e){
	if(e % 2 == 0) return routeIndex(m, bound, e/2);
	return (bound == 1) ? (e - 1)/2 : m.count - 2 - (e - 1)/2;
}

function pairKey(m, e, a, b){
	const n = m.trains.length;
	return (e*n + Math.min(a.id, b.id))*n + Math.max(a.id, b.id);
}

// times on the grid of timeGranularity
function alignDown(m, time){
	return Math.floor(time/m.grid)*m.grid;
}

function alignUp(m, time){
	return Math.ceil(time/m.grid)*m.grid;
}

// straight line between the known times at orders p and q
function interpolate(m, t, p, q){
	const kms = m.kms[t.bound];
	const pace = (t.arr[q] - t.dep[p])/(kms[q] - kms[p]);
	for(let k = p + 1; k < q; k++){
		t.arr[k] = t.dep[k] = t.dep[p] + pace*(kms[k] - kms[p]);
	}
}

// a train is in a station from its arrival to its departure, but only from its departure at its first stop
// and until its arrival at its last stop
function entryTime(m, t, e){
	const k = elementOrder(m, t.bound, e);
	if(e % 2 == 1) return t.dep[k];
	return (k == t.first) ? t.dep[k] : t.arr[k];
}

function exitTime(m, t, e){
	const k = elementOrder(m, t.bound, e);
	if(e % 2 == 1) return t.arr[k + 1];
	return (k == t.last) ? t.arr[k] : t.dep[k];
}

// whether two trains of the same bound change order in an element; not counted in a station where one starts or ends
function overtakes(m, a, b, e){
	const k = elementOrder(m, a.bound, e);
	if(e % 2 == 1) return (a.dep[k] - b.dep[k])*(a.arr[k + 1] - b.arr[k + 1]) < 0;
	if(k == a.first || k == a.last || k == b.first || k == b.last) return false;
	return (a.arr[k] - b.arr[k])*(a.dep[k] - b.dep[k]) < 0;
}

// whether two trains are in an element at the same time
function meets(m, a, b, e){
	return entryTime(m, a, e) < exitTime(m, b, e) && entryTime(m, b, e) < exitTime(m, a, e);
}

// whether the trains of a bound arriving at (leaving) its station order k share one track, so they keep minTimeSeparation;
// not if they can overtake on the section
function entryGap(m, bound, k){
	return k > 0 && !(m.tracks[sectionElement(m, bound, k - 1)].bits & bound);
}

function exitGap(m, bound, k){
	return k < m.count - 1 && !(m.tracks[sectionElement(m, bound, k)].bits & bound);
}

// whether two trains of the same bound arrive at or leave station e less than minTimeSeparation apart
function tooClose(m, e, a, b){
	const k = elementOrder(m, a.bound, e);
	return (k != a.first && k != b.first && Math.abs(a.arr[k] - b.arr[k]) < m.gap && entryGap(m, a.bound, k))
		|| (k != a.last && k != b.last && Math.abs(a.dep[k] - b.dep[k]) < m.gap && exitGap(m, a.bound, k));
}

/*
	Whether b overtaking a (same bound, a ahead before) in element e is a conflict:
	- the bound cannot overtake there
	- double track: an opposite train is there while b passes a
	- triple track: an opposite train is overtaken there at the same time (a conflict for both bounds)
*/
function overtakeConflict(m, e, a, b){
	const { lines, bits } = m.tracks[e];
	if(!(bits & a.bound)) return true;
	if(lines == 4) return false;

	const opposite = 3 - a.bound;
	if(lines == 2){
		const from = entryTime(m, b, e);
		const to = exitTime(m, b, e);
		return m.present[e][opposite].some(c => entryTime(m, c, e) < to && exitTime(m, c, e) > from);
	}
	if(!(bits & opposite)) return false;
	const from = entryTime(m, a, e);
	const to = exitTime(m, a, e);
	return m.overtakes[e].some(([a2, b2]) => a2.bound == opposite && overtakes(m, a2, b2, e)
		&& entryTime(m, a2, e) < to && exitTime(m, a2, e) > from);
}

// how bad a and b are together in element e: 0, HEADWAY (only when tuning) or CONFLICT
function pairConflict(m, e, a, b){
	if(a.bound != b.bound) return (m.tracks[e].lines == 1 && meets(m, a, b, e)) ? CONFLICT : 0;
	if(m.tracks[e].lines < 4 && overtakes(m, a, b, e)
		&& ((entryTime(m, a, e) < entryTime(m, b, e)) ? overtakeConflict(m, e, a, b) : overtakeConflict(m, e, b, a))) return CONFLICT;
	return (m.tune && e % 2 == 0 && tooClose(m, e, a, b)) ? HEADWAY : 0;
}

// insertion sort by key, calling onSwap(a, b) for every pair that changes order (b was behind a). O(length + swaps)
function sortSwaps(list, key, onSwap){
	const keys = list.map(key);
	for(let i = 1; i < list.length; i++){
		const t = list[i];
		const time = keys[i];
		let j = i - 1;
		for(; j >= 0 && keys[j] > time; j--){
			onSwap(list[j], t);
			list[j + 1] = list[j];
			keys[j + 1] = keys[j];
		}
		list[j + 1] = t;
		keys[j + 1] = time;
	}
}

// report(a, b) for every two trains of the list (sorted by key) less than gap apart. O(length + pairs)
function closeTimes(list, key, gap, report){
	const keys = list.map(key);
	for(let i = 0; i < list.length; i++){
		for(let j = i + 1; j < list.length && keys[j] - keys[i] < gap; j++) report(list[i], list[j]);
	}
}

/*
	Goes along the bound keeping its trains in the order they reach each point:
	report(e, a, b) when b passes a in element e, and (fine-tuning) close(e, a, b) when a and b arrive at or leave
	station e less than minTimeSeparation apart.
*/
function sweepOvertakes(m, bound, report, close){
	const starts = Array.from({ length: m.count }, () => []);
	m.trains.forEach(t => {
		if(t.bound == bound) starts[t.first].push(t);
	});

	let list = [];
	for(let k = 0; k < m.count; k++){
		const station = stationElement(m, bound, k);
		// the trains arriving here, by arrival
		if(m.headway && entryGap(m, bound, k)) closeTimes(list, t => t.arr[k], m.gap, (a, b) => close(station, a, b));
		list = list.filter(t => t.last != k);
		sortSwaps(list, t => t.dep[k], (a, b) => report(station, a, b));

		// trains starting here join in order of departure
		const joined = [];
		let i = 0;
		starts[k].sort((a, b) => a.dep[k] - b.dep[k]).forEach(t => {
			while(i < list.length && list[i].dep[k] <= t.dep[k]) joined.push(list[i++]);
			joined.push(t);
		});
		list = joined.concat(list.slice(i));
		// the trains leaving here, by departure
		if(m.headway && exitGap(m, bound, k)) closeTimes(list, t => t.dep[k], m.gap, (a, b) => close(station, a, b));

		if(k < m.count - 1){
			const section = sectionElement(m, bound, k);
			sortSwaps(list, t => t.arr[k + 1], (a, b) => report(section, a, b));
		}
	}
}

// report(a, b) for every two opposite trains in element e at the same time
function crossings(m, e, report){
	const events = [];
	[1, 2].forEach(bound => m.present[e][bound].forEach(t => {
		events.push([entryTime(m, t, e), 1, t], [exitTime(m, t, e), 0, t]);
	}));
	// entries first at the same time; meets() leaves out trains that only touch
	events.sort((x, y) => x[0] - y[0] || y[1] - x[1]);

	const inside = { 1: new Set(), 2: new Set() };
	events.forEach(([time, entry, t]) => {
		if(entry){
			inside[3 - t.bound].forEach(c => {
				if(meets(m, t, c, e)) report(t, c);
			});
			inside[t.bound].add(t);
		}else{
			inside[t.bound].delete(t);
		}
	});
}

// [{ type, e, a, b, time }], headways last, latest first. type: "overtake" (b overtakes a), "cross" or "headway";
// one per pair and element
function detectConflicts(m){
	const found = new Set();
	const conflicts = [];
	const add = (type, e, a, b, time) => {
		const key = pairKey(m, e, a, b);
		if(found.has(key)) return;
		found.add(key);
		conflicts.push({ type: type, e: e, a: a, b: b, time: time });
	};

	const close = [];
	m.overtakes = m.tracks.map(() => []);
	[1, 2].forEach(bound => sweepOvertakes(m, bound, (e, a, b) => {
		if(m.tracks[e].lines < 4 && overtakes(m, a, b, e)) m.overtakes[e].push([a, b]);
	}, (e, a, b) => close.push([e, a, b])));

	m.overtakes.forEach((pairs, e) => pairs.forEach(([a, b]) => {
		if(overtakeConflict(m, e, a, b)) add("overtake", e, a, b, entryTime(m, b, e));
	}));
	m.tracks.forEach((track, e) => {
		if(track.lines == 1) crossings(m, e, (a, b) => add("cross", e, a, b, Math.max(entryTime(m, a, e), entryTime(m, b, e))));
	});
	close.forEach(([e, a, b]) => add("headway", e, a, b, Math.min(entryTime(m, a, e), entryTime(m, b, e))));
	// a passing time for a headway splits the line of its train, so it goes after the conflicts that may need that line
	return conflicts.sort((x, y) => (x.type == "headway") - (y.type == "headway") || y.time - x.time);
}

function countConflicts(conflicts){
	const counts = { overtake: 0, cross: 0, headway: 0 };
	conflicts.forEach(c => counts[c.type]++);
	return counts;
}

function conflictScore(conflicts){
	return conflicts.reduce((sum, c) => sum + ((c.type == "headway") ? HEADWAY : CONFLICT), 0);
}

// whether a conflict is still there; puts the trains of an overtaking back in order (a ahead before)
function refreshConflict(m, c){
	if(c.type == "headway") return tooClose(m, c.e, c.a, c.b);
	if(c.type == "cross") return meets(m, c.a, c.b, c.e);
	if(!overtakes(m, c.a, c.b, c.e)) return false;
	if(entryTime(m, c.a, c.e) > entryTime(m, c.b, c.e)) [c.a, c.b] = [c.b, c.a];
	return overtakeConflict(m, c.e, c.a, c.b);
}

// min running time of train t from order a to b (max speeds, or estimated ones), at least 1 s
function minRun(m, t, a, b){
	return Math.max(Math.abs(m.runPrefix[routeIndex(m, t.bound, b)] - m.runPrefix[routeIndex(m, t.bound, a)]), 1);
}

// orders of t's known times before and after order s
function knownAround(t, s){
	let p = s - 1;
	while(!t.fixed[p]) p--;
	let q = s + 1;
	while(!t.fixed[q]) q++;
	return [p, q];
}

/*
	The other trains of x's bound at its station s: the ones passing without a stop, ahead of x and behind it,
	nearest first; and (when tuning) where the ones stopping there arrive and leave, if those need a gap
	(not where y arrives, if it may move)
*/
function passingTrains(m, x, s, y){
	const ahead = [];
	const behind = [];
	const stops = [];
	const entry = m.tune && entryGap(m, x.bound, s);
	const exit = m.tune && exitGap(m, x.bound, s);
	m.present[stationElement(m, x.bound, s)][x.bound].forEach(z => {
		if(z == x) return;
		if(z.arr[s] != z.dep[s] && s != z.first && s != z.last){
			if(entry && !(z == y && movesArrival(z, s))) stops.push(z.arr[s]);
			if(exit) stops.push(z.dep[s]);
			return;
		}
		const time = (s == z.first) ? z.dep[s] : z.arr[s];
		(time > x.arr[s] ? behind : ahead).push({ t: z, time: time });
	});
	ahead.sort((u, v) => v.time - u.time);
	behind.sort((u, v) => u.time - v.time);
	return { ahead: ahead, behind: behind, stops: stops };
}

// moves time along the grid in direction dir until it is minTimeSeparation from each of `times`
function keepAway(m, time, times, dir){
	for(let moved = true; moved;){
		moved = false;
		times.forEach(other => {
			if(Math.abs(time - other) >= m.gap) return;
			time = (dir < 0) ? alignDown(m, other - m.gap) : alignUp(m, other + m.gap);
			moved = true;
		});
	}
	return time;
}

/*
	Passing times at station s for x (between its known times at p and q) while y waits there, as [{ t, time }].
	`late`: x passes as late as possible, at least minTimeSeparation before y leaves (also where y starts there);
	otherwise as early as possible, at least minTimeSeparation after y arrives (also where y ends there).
	Within the max speeds, x keeps its order with the other trains passing s (`passing`), minTimeSeparation apart:
	with `push`, the trains x moves towards that may move there are moved on too; without, only their order is kept.
	null if not possible. Trains stopping at s are left out (x may overtake them there), but when tuning
	x keeps minTimeSeparation from where they arrive and leave.
	`late` with y's arrival loose: y arrives minTimeSeparation before the first of them, as { t, s, time, arrival }.
*/
function passingPlan(m, x, s, p, q, y, ys, passing, push, late){
	const gap = m.gap;
	const loose = late && movesArrival(y, ys);
	const low = (ys == y.first) ? -Infinity : loose ? earliestArrival(m, y, ys) : y.arr[ys];
	const high = (ys == y.last) ? Infinity : y.dep[ys] - gap;
	// after y arrives: passing at the same time would only look like no overtaking
	let from = Math.max(x.dep[p] + minRun(m, x, p, s), low + (late && !loose ? m.grid : gap));
	let to = Math.min(x.arr[q] - minRun(m, x, s, q), high);

	const { ahead, behind, stops } = passing;
	const gapOf = z => (push || z.t.fixed[s]) ? gap : 0;

	// the trains on the side x keeps to only limit it
	(late ? behind : ahead).forEach(z => {
		if(z.t == y) return;
		if(late) to = Math.min(to, z.time - gapOf(z));
		else     from = Math.max(from, z.time + gapOf(z));
	});
	const dir = late ? -1 : 1;
	let time = keepAway(m, late ? alignDown(m, to) : alignUp(m, from), stops, dir);
	if(!(time >= from && time <= to)) return null;
	const plan = [{ t: x, time: time }];

	// the ones on the other side are in the way if x moves towards them
	if(dir*(time - x.arr[s]) > 0){
		for(const z of (late ? ahead : behind)){
			if(z.t == y) continue;
			if(dir*(z.time - time) >= gapOf(z)){
				if(push) break;
				continue;
			}
			if(!push || !z.t.free[s]) return null;
			time = late ? alignDown(m, time - gap) : alignUp(m, time + gap);
			const [zp, zq] = knownAround(z.t, s);
			if(time <= low || time > high || time < z.t.dep[zp] + minRun(m, z.t, zp, s) || time > z.t.arr[zq] - minRun(m, z.t, s, zq)) return null;
			plan.push({ t: z.t, time: time });
		}
	}
	if(!loose) return plan;
	const arrival = Math.min(y.arr[ys], alignDown(m, time - gap));
	if(arrival < low) return null;
	if(arrival < y.arr[ys]) plan.push({ t: y, s: ys, time: arrival, arrival: true });
	return plan;
}

// how far x passing s now is from inside y's natural temporary stop at ys (tempStopTimes()), minTimeSeparation from it
// (timeGranularity for an opposite train); more if that stop is too short, so the train with time to spare waits
function tempStopMove(m, x, s, y, ys){
	const margin = (x.bound == y.bound) ? m.gap : m.grid;
	const [arr, dep] = tempStopTimes(m, y, ys);
	return Math.max(arr + margin - x.arr[s], 0) + Math.max(x.arr[s] - dep + margin, 0);
}

// x passes s while y makes a temporary stop at ys, minTimeSeparation apart (timeGranularity for an opposite train):
// x as near its time now as both trains' max speeds allow, y arriving where it naturally would (tempStopTimes())
// and leaving then, or else just before and after x
function tempStopPlan(m, x, s, p, q, y, ys){
	const margin = (x.bound == y.bound) ? m.gap : m.grid;
	const [yp, yq] = knownAround(y, ys);
	const from = alignUp(m, Math.max(x.dep[p] + minRun(m, x, p, s), y.dep[yp] + minRun(m, y, yp, ys) + margin));
	const to = alignDown(m, Math.min(x.arr[q] - minRun(m, x, s, q), y.arr[yq] - minRun(m, y, ys, yq) - margin));
	if(from > to) return null;
	const [arr, dep] = tempStopTimes(m, y, ys);
	const time = Math.min(Math.max(Math.round(x.arr[s]/m.grid)*m.grid, from), to);
	return [{ t: x, time: time }, { t: y, s: ys, temp: true,
		arr: alignDown(m, Math.min(arr, time - margin)), dep: alignUp(m, Math.max(dep, time + margin)) }];
}

// y arrives at its loose stop ys minTimeSeparation before x arrives at its stop s, and x leaves before y does
function arrivalPlan(m, x, s, y, ys){
	if(!movesArrival(y, ys) || !(s == x.last || ys == y.last || x.dep[s] <= y.dep[ys] - m.gap)) return null;
	const time = alignDown(m, x.arr[s] - m.gap);
	if(time >= y.arr[ys] || time < earliestArrival(m, y, ys)) return null;
	return [{ t: y, s: ys, time: time, arrival: true }];
}

function samePlan(a, b){
	return a.length == b.length && a.every((point, i) => point.t == b[i].t && point.time == b[i].time && point.arrival == b[i].arrival);
}

// ways to solve conflict c by letting x pass a station near it while y waits there (a long stop, or where y starts / ends);
// or, at x's stop after c, by moving y's loose arrival there up
function addCandidates(m, c, x, y, out){
	const { maxSearchDepth } = SETTINGS.passingTime;
	const station = (c.e % 2 == 0);
	const k = elementOrder(m, x.bound, c.e);
	const end = station ? k : k + 1;

	// x's times in the element come from its line between orders p and q
	let p = k;
	while(!x.fixed[p]) p--;
	let q = end;
	while(!x.fixed[q]) q++;

	for(let s = p + 1; s <= q; s++){
		const distance = station ? Math.abs(s - k) : (s <= k ? k - s + 1 : s - k);
		if(distance > maxSearchDepth || (s < q ? !x.free[s] : x.fixed[s] != 1)) continue;
		const r = routeIndex(m, x.bound, s);
		const ys = routeIndex(m, y.bound, r);
		const { lines, bits } = m.tracks[2*r];
		const stop = canStop(y, ys);
		if(!(y.wait[ys] || ys == y.first || ys == y.last || stop) || (x.bound == y.bound ? !(bits & x.bound) : lines < 2)) continue;
		if(s == q){
			const plan = arrivalPlan(m, x, s, y, ys);
			if(plan) out.push({ x: x, s: s, points: plan, distance: distance, move: y.arr[ys] - plan[0].time });
			continue;
		}
		if(stop){
			const plan = tempStopPlan(m, x, s, p, q, y, ys);
			if(plan) out.push({ x: x, s: s, points: plan, distance: distance, move: tempStopMove(m, x, s, y, ys) });
			continue;
		}

		// late (just before y leaves) first, then early; keeping the gap (moving the trains in the way) first, then only the order
		const plans = [];
		const passing = passingTrains(m, x, s, y);
		((ys == y.last) ? [false] : (ys == y.first) ? [true] : [true, false]).forEach(late => [true, false].forEach(push => {
			const plan = passingPlan(m, x, s, p, q, y, ys, passing, push, late);
			if(plan && !plans.some(other => samePlan(other, plan))) plans.push(plan);
		}));
		plans.forEach(plan => out.push({ x: x, s: s, points: plan, distance: distance, move: Math.abs(plans[0][0].time - x.arr[s]) }));
	}
}

// moves the passing trains of `list` (nearest first) less than minTimeSeparation from `time` on in direction dir,
// within their max speeds and on their side of `stops`; their [{ t, time }], or null if one cannot move
function pushAway(m, s, list, time, dir, stops){
	const points = [];
	for(const z of list){
		if(dir*(z.time - time) >= m.gap) break;
		if(!z.t.free[s]) return null;
		time = (dir < 0) ? alignDown(m, time - m.gap) : alignUp(m, time + m.gap);
		const [zp, zq] = knownAround(z.t, s);
		if(time < z.t.dep[zp] + minRun(m, z.t, zp, s) || time > z.t.arr[zq] - minRun(m, z.t, s, zq)) return null;
		if(stops.some(stop => (stop - z.time)*(stop - time) < 0 || Math.abs(stop - time) < m.gap)) return null;
		points.push({ t: z.t, time: time });
	}
	return points;
}

/*
	Moving x's passing time at the station of headway conflict c as little as possible: x stays on its side of
	where the trains stopping there arrive and leave, minTimeSeparation apart, within the max speeds.
	First keeping its order with the trains passing there too, then moving the ones in the way.
*/
function addHeadwayCandidates(m, c, x, out){
	const s = elementOrder(m, x.bound, c.e);
	if(x.vague[s]){
		addStopTimeCandidates(m, x, s, out);
		return;
	}
	if(!x.free[s]) return;
	const [p, q] = knownAround(x, s);
	const now = x.arr[s];
	const { ahead, behind, stops } = passingTrains(m, x, s);
	let from = x.dep[p] + minRun(m, x, p, s);
	let to = x.arr[q] - minRun(m, x, s, q);
	stops.forEach(time => {
		if(time < now) from = Math.max(from, time + m.gap);
		else           to = Math.min(to, time - m.gap);
	});

	const plans = [];
	[false, true].forEach(push => {
		let low = from;
		let high = to;
		if(!push){
			ahead.forEach(z => low = Math.max(low, z.time + m.gap));
			behind.forEach(z => high = Math.min(high, z.time - m.gap));
		}
		low = alignUp(m, low);
		high = alignDown(m, high);
		if(low > high) return;
		const time = Math.min(Math.max(Math.round(now/m.grid)*m.grid, low), high);
		const plan = [{ t: x, time: time }];
		if(push){
			const before = pushAway(m, s, ahead, time, -1, stops);
			const after = pushAway(m, s, behind, time, 1, stops);
			if(!before || !after) return;
			plan.push(...before, ...after);
		}
		if(!plans.some(other => samePlan(other, plan))) plans.push(plan);
	});
	plans.forEach(plan => out.push({ x: x, s: s, points: plan, distance: 0, move: Math.abs(plans[0][0].time - now) }));
}

/*
	For a headway at x's vague stop s: its arrival (departure) moved as little as possible to minTimeSeparation from
	the other trains arriving at (leaving) s, keeping its order with them, within where it may be
*/
function addStopTimeCandidates(m, x, s, out){
	[false, true].forEach(leave => {
		if(leave ? s == x.last || !exitGap(m, x.bound, s) : s == x.first || !entryGap(m, x.bound, s)) return;
		const now = leave ? x.dep[s] : x.arr[s];
		let low, high;
		if(leave){
			let q = s + 1;
			while(!x.fixed[q]) q++;
			low = Math.max(x.depMin[s], x.arr[s] + dwellOf(m, x, s));
			high = Math.min(x.depMax[s], x.arr[q] - minRun(m, x, s, q));
		}else{
			let p = s - 1;
			while(!x.fixed[p]) p--;
			low = Math.max(x.early[s], x.dep[p] + minRun(m, x, p, s));
			high = Math.min(x.arrMax[s], x.dep[s] - dwellOf(m, x, s));
		}
		m.present[stationElement(m, x.bound, s)][x.bound].forEach(z => {
			if(z == x || s == (leave ? z.last : z.first)) return;
			const other = leave ? z.dep[s] : z.arr[s];
			if(other < now || (other == now && z.id < x.id)) low = Math.max(low, other + m.gap);
			else high = Math.min(high, other - m.gap);
		});
		low = alignUp(m, low);
		high = alignDown(m, high);
		if(low > high) return;
		const time = Math.min(Math.max(Math.round(now/m.grid)*m.grid, low), high);
		if(time != now) out.push({ x: x, s: s, points: [{ t: x, s: s, time: time, arrival: !leave, departure: leave }], distance: 0, move: Math.abs(time - now) });
	});
}

// ways to solve conflict c (only the ones moving x, if given): nearest station first, then the smallest change of time
function conflictCandidates(m, c, x){
	const candidates = [];
	if(c.type == "headway"){
		[c.a, c.b].forEach(t => {
			if(!x || t == x) addHeadwayCandidates(m, c, t, candidates);
		});
	}else{
		// [the train that passes, the train that waits]
		(c.type == "cross" ? [[c.a, c.b], [c.b, c.a]] : [[c.b, c.a]]).forEach(([passer, waiter]) => {
			if(!x || passer == x) addCandidates(m, c, passer, waiter, candidates);
		});
	}
	return candidates.sort((u, v) => u.distance - v.distance || u.move - v.move);
}

/*
	An attempt to solve a conflict may change several trains. Before a train changes somewhere, every pair it forms
	there with another train is recorded with how bad it was, so the attempt is kept only if the pairs get better:
	fewer conflicts, or as many and fewer headways.
*/
function newAttempt(){
	return { pairs: new Map(), undo: [] };
}

// `arrival`: t's arrival at q moves, so its station too; `departure`: the same for its departure at p
function watch(m, attempt, t, p, q, arrival, departure){
	// t stays between its times at p and q there, so trains farther than that can never be in a conflict with it
	const margin = m.tune ? m.gap : 0;
	const from = departure ? t.arr[p] : t.dep[p];
	const until = arrival ? t.dep[q] : t.arr[q];
	const watchElement = e => {
		if(m.tracks[e].lines == 4 && !(m.tune && e % 2 == 0)) return;
		const add = o => {
			if(o == t || exitTime(m, o, e) < from - margin || entryTime(m, o, e) > until + margin) return;
			const key = pairKey(m, e, t, o);
			if(!attempt.pairs.has(key)) attempt.pairs.set(key, { e: e, a: t, b: o, before: pairConflict(m, e, t, o) });
		};
		m.present[e][t.bound].forEach(add);
		if(m.tracks[e].lines == 1) m.present[e][3 - t.bound].forEach(add);
	};
	for(let k = p; k < q; k++){
		if(k > p || departure) watchElement(stationElement(m, t.bound, k));
		watchElement(sectionElement(m, t.bound, k));
	}
	if(arrival) watchElement(stationElement(m, t.bound, q));
}

function setPassingTime(m, attempt, t, s, time){
	const [p, q] = knownAround(t, s);
	watch(m, attempt, t, p, q);
	attempt.undo.push({ t: t, s: s, p: p, q: q, fixed: t.fixed[s], temp: t.temp[s], arr: t.arr[s], dep: t.dep[s] });
	t.fixed[s] = 2;
	t.temp[s] = 0;
	t.arr[s] = t.dep[s] = time;
	interpolate(m, t, p, s);
	interpolate(m, t, s, q);
}

// a temporary stop of t at its station order k
function setTempStop(m, attempt, t, k, arr, dep){
	const [p, q] = knownAround(t, k);
	watch(m, attempt, t, p, q);
	attempt.undo.push({ t: t, s: k, p: p, q: q, fixed: t.fixed[k], temp: t.temp[k], arr: t.arr[k], dep: t.dep[k] });
	t.fixed[k] = 2;
	t.temp[k] = 1;
	t.arr[k] = arr;
	t.dep[k] = dep;
	interpolate(m, t, p, k);
	interpolate(m, t, k, q);
}

// moves t's loose arrival at its stop k
function setArrival(m, attempt, t, k, time){
	let p = k - 1;
	while(!t.fixed[p]) p--;
	watch(m, attempt, t, p, k, true);
	attempt.undo.push({ t: t, s: k, p: p, arrival: true, time: t.arr[k] });
	t.arr[k] = time;
	interpolate(m, t, p, k);
}

// moves t's departure at its vague stop k
function setDeparture(m, attempt, t, k, time){
	let q = k + 1;
	while(!t.fixed[q]) q++;
	watch(m, attempt, t, k, q, false, true);
	attempt.undo.push({ t: t, s: k, q: q, departure: true, time: t.dep[k] });
	t.dep[k] = time;
	interpolate(m, t, k, q);
}

// undoes the attempt's changes after the first `length`
function undoPassingTimes(m, attempt, length){
	while(attempt.undo.length > length){
		const { t, s, p, q, fixed, temp, arr, dep, time, arrival, departure } = attempt.undo.pop();
		if(arrival){
			t.arr[s] = time;
			interpolate(m, t, p, s);
			continue;
		}
		if(departure){
			t.dep[s] = time;
			interpolate(m, t, s, q);
			continue;
		}
		t.fixed[s] = fixed;
		t.temp[s] = temp;
		t.arr[s] = arr;
		t.dep[s] = dep;
		if(fixed){
			interpolate(m, t, p, s);
			interpolate(m, t, s, q);
		}else{
			interpolate(m, t, p, q);
		}
	}
}

// keeps the candidate if it solves c and the attempt then gets better, with up to `depth` more passing times of its train
function tryCandidate(m, attempt, c, candidate, depth){
	const length = attempt.undo.length;
	candidate.points.forEach(({ t, s, time, arrival, departure, temp, arr, dep }) => {
		if(arrival) setArrival(m, attempt, t, s, time);
		else if(departure) setDeparture(m, attempt, t, s, time);
		else if(temp) setTempStop(m, attempt, t, s, arr, dep);
		else setPassingTime(m, attempt, t, candidate.s, time);
	});
	if(!refreshConflict(m, c) && settle(m, attempt, candidate.x, depth)) return true;
	undoPassingTimes(m, attempt, length);
	return false;
}

function settle(m, attempt, x, depth){
	let change = 0;
	const left = [];
	attempt.pairs.forEach(({ e, a, b, before }) => {
		const now = pairConflict(m, e, a, b);
		change += now - before;
		if((now == CONFLICT || (now && m.tune)) && (a == x || b == x)) left.push({ type: (now == HEADWAY) ? "headway" : (a.bound == b.bound) ? "overtake" : "cross", e: e, a: a, b: b });
	});
	if(change < 0) return true;
	if(depth == 0) return false;

	// one more passing time of x for one of its conflicts
	return left.some(c => {
		refreshConflict(m, c);
		return conflictCandidates(m, c, x).some(candidate => tryCandidate(m, attempt, c, candidate, depth - 1));
	});
}

// whether conflict c was solved; headways only when tuning
function solveConflict(m, c){
	if((c.type == "headway" && !m.tune) || !refreshConflict(m, c)) return false;
	return conflictCandidates(m, c).some(candidate => tryCandidate(m, newAttempt(), c, candidate, SETTINGS.passingTime.maxPassingPointIncrease));
}

// writes the passing times, temporary stops, loose arrivals (a blank one stays blank at departure - stopsec) and vague
// stops to the trains; returns how many passing times were added, how many in the timetable moved, how many temporary
// stops were made, how many arrivals changed and how many times of vague stops changed
function writePassingTimes(m){
	const stations = { 1: boundStations(1), 2: boundStations(2) };
	const written = { added: 0, moved: 0, stops: 0, arrivals: 0, times: 0 };
	m.trains.forEach(t => {
		t.vague.forEach((vague, k) => {
			if(!vague) return;
			const stop = findStop(t.train, k);
			const arrival = toStr(Math.round(t.arr[k]) % 86400);
			const departure = toStr(Math.round(t.dep[k]) % 86400);
			written.times += (stop.arrival != arrival) + (stop.departure != departure);
			stop.arrival = arrival;
			stop.departure = departure;
		});
		t.loose.forEach((loose, k) => {
			if(!loose) return;
			const stop = findStop(t.train, k);
			const sec = Math.round(t.arr[k]);
			const arrival = toStr(sec % 86400);
			if((!stop.arrival && sec == t.dep[k] - m.stopsecs[t.bound][k]) || stop.arrival == arrival) return;
			stop.arrival = arrival;
			written.arrivals++;
		});
		let added = false;
		t.fixed.forEach((fixed, k) => {
			if(fixed != 2) return;
			const arrival = toStr(Math.round(t.arr[k]) % 86400);
			const departure = toStr(Math.round(t.dep[k]) % 86400);
			const stop = findStop(t.train, k);
			if(arrival != departure) written.stops++;
			if(stop){
				if(arrival == departure && toSec(stop.departure) != toSec(departure)) written.moved++;
				stop.arrival = arrival;
				stop.departure = departure;
			}else{
				t.train.timetable.push({ station_order: k, station_name: stations[t.bound][k].name, arrival: arrival, departure: departure });
				if(arrival == departure) written.added++;
				added = true;
			}
		});
		if(added) t.train.timetable.sort((a, b) => a.station_order - b.station_order);
	});
	return written;
}

/*
	Smoothing an imprecise timetable (smoothRuns), after solving: the times of every train are moved within where they
	may be so that each of its runs is near the target run between the same two points, and the targets are chosen
	together with the times: minimising the total (robust) deviation from the targets, by turns
	- the best times of each train for the targets (smoothTrain()): a vague time has only a few values on the grid,
	  so they are found exactly along its times in order (dynamic programming); stops are free to be longer than minDwell;
	- the best target of each section for the runs (refineTargets()),
	until the targets settle. They start from the golden runs (runTargets()). At the end a train keeps its new times
	only if it is not worse together with the trains around it (conflicts, and headways when tuning).
*/
const SMOOTH_ROUNDS = 15;
const SMOOTH_VALUES = 30;   // most values of a vague time tried
const SMOOTH_CENTER = 0.05; // weight of staying near the middle of where a time may be, so even runs win
const SMOOTH_CAP = 0.05;    // a target is a run all but this share of the trains can make or beat
const SMOOTH_ROBUST = 0.1;  // runs off a target by more than this share count linearly, not squared
const SMOOTH_OTHER = 0.5;   // weight of a run of the other bound between the same stations

function smoothRuns(m){
	const original = new Map(m.trains.map(t => [t, [t.arr.slice(), t.dep.slice()]]));
	const sections = runSections(m);
	let targets = runTargets(m, sections);
	for(let round = 0; round < SMOOTH_ROUNDS; round++){
		m.trains.forEach(t => smoothTrain(m, t, targets));
		const next = refineTargets(m, sections, targets);
		const settled = [...next].every(([key, run]) => Math.abs(run - targets.get(key)) < m.grid/2);
		targets = next;
		if(settled) break;
	}
	// from the times before, one train at a time, so the trains together never get worse
	const smoothed = new Map(m.trains.map(t => [t, [t.arr.slice(), t.dep.slice()]]));
	m.trains.forEach(t => {
		const [arr, dep] = original.get(t);
		t.arr.set(arr);
		t.dep.set(dep);
	});
	m.trains.forEach(t => {
		const [arr, dep] = original.get(t);
		const near = nearPairs(m, t, ...smoothed.get(t));
		const score = () => near.reduce((sum, [e, o]) => sum + pairConflict(m, e, t, o), 0);
		const before = score();
		t.arr.set(smoothed.get(t)[0]);
		t.dep.set(smoothed.get(t)[1]);
		if(score() <= before) return;
		t.arr.set(arr);
		t.dep.set(dep);
	});
}

// how much a run off its target by the share x costs
function smoothCost(x){
	x = Math.abs(x);
	return (x <= SMOOTH_ROBUST) ? x*x : 2*SMOOTH_ROBUST*x - SMOOTH_ROBUST*SMOOTH_ROBUST;
}

// [shortest, longest] run of t from its known time at p to the one at q, as far as where they may be allows
function runRange(m, t, p, q){
	const [leaveMin, leaveMax] = t.vague[p] ? [t.depMin[p], t.depMax[p]] : [t.dep[p], t.dep[p]];
	const [arriveMin, arriveMax] = t.vague[q] ? [t.early[q], t.arrMax[q]] : [t.arr[q], t.arr[q]];
	const longest = arriveMax - leaveMin;
	return [Math.min(Math.max(arriveMin - leaveMax, minRun(m, t, p, q)), longest), longest];
}

// every two known times in a row by goldenKey(): { bound, physical (goldenKey() of both bounds), runs: [[train, p, q]],
// ranges (runRange()), cap: the longest run all but SMOOTH_CAP of them can make or beat }
function runSections(m){
	const sections = new Map();
	m.trains.forEach(t => {
		for(let p = t.first, q = p + 1; q <= t.last; q++){
			if(!t.fixed[q]) continue;
			const key = goldenKey(m, t, p, q, false);
			if(!sections.has(key)) sections.set(key, { bound: t.bound, physical: goldenKey(m, t, p, q, true), runs: [], ranges: [] });
			sections.get(key).runs.push([t, p, q]);
			sections.get(key).ranges.push(runRange(m, t, p, q));
			p = q;
		}
	});
	const bounds = new Map([...sections.values()].map(section => [`${section.physical}/${section.bound}`, section]));
	sections.forEach(section => {
		section.other = bounds.get(`${section.physical}/${3 - section.bound}`);
		const longest = section.ranges.map(([low, high]) => high).sort((a, b) => a - b);
		section.cap = longest[Math.floor(SMOOTH_CAP*(longest.length - 1))];
	});
	return sections;
}

// how many of the ranges can make the run
function suits(ranges, run){
	return ranges.filter(([low, high]) => low <= run && run <= high).length;
}

// the run the most of `ranges` can make, up to `cap` (padding only makes a run longer, so many padded trains do not
// drag it up); the middle of the best stretch
function goldenRun(m, ranges, cap){
	const events = [];
	ranges.forEach(([low, high]) => {
		if(low <= cap) events.push([low, 1], [Math.min(high, cap), -1]);
	});
	// a range counts at both of its ends
	events.sort((x, y) => x[0] - y[0] || y[1] - x[1]);
	let count = 0, best = 0, from = cap, to = cap;
	events.forEach(([time, change], i) => {
		count += change;
		if(change > 0 && count > best && (i + 1 == events.length || events[i + 1][0] > time || events[i + 1][1] < 0)){
			best = count;
			from = time;
			to = events.slice(i + 1).find(([, next]) => next < 0)?.[0] ?? cap;
		}
	});
	return Math.round((from + to)/2/m.grid)*m.grid;
}

// whether the other bound's target `run` suits at least half the trains of the section
function shared(section, run){
	return run !== undefined && suits(section.ranges, run) >= section.ranges.length/2;
}

// the first targets: the golden run of each section from where the times may be, rather than where they are now;
// of both bounds if that suits the section
function runTargets(m, sections){
	const targets = new Map();
	sections.forEach((section, key) => {
		const own = goldenRun(m, section.ranges, section.cap);
		const both = section.other && goldenRun(m, section.ranges.concat(section.other.ranges), Math.min(section.cap, section.other.cap));
		targets.set(key, shared(section, both) ? both : own);
	});
	return targets;
}

// the robust centre of each section's runs now (and of its other bound's, at SMOOTH_OTHER, if their target suits it),
// up to its cap; a train that cannot run within the cap is padded for sure, and left out
function refineTargets(m, sections, targets){
	const runsOf = (section, weight) => section.runs.filter((run, i) => section.ranges[i][0] <= section.cap)
		.map(([t, p, q]) => [t.arr[q] - t.dep[p], weight]);
	const next = new Map();
	sections.forEach((section, key) => {
		const values = runsOf(section, 1);
		const other = section.other && targets.get(goldenKey(m, ...section.other.runs[0], false));
		if(shared(section, other)) values.push(...runsOf(section.other, SMOOTH_OTHER));
		let run = targets.get(key);
		for(let i = 0; i < 5; i++){
			let sum = 0, weights = 0;
			values.forEach(([value, weight]) => {
				const off = Math.abs(value - run);
				const w = (off <= SMOOTH_ROBUST*run) ? weight : weight*SMOOTH_ROBUST*run/off;
				sum += w*value;
				weights += w;
			});
			run = sum/weights;
		}
		next.set(key, Math.min(run, section.cap));
	});
	return next;
}

// [e, o] for every element of t's range and train o that may be near t there, now or at (arr, dep)
function nearPairs(m, t, arr, dep){
	const from = Math.min(dep[t.first], t.dep[t.first]) - m.precision - m.gap;
	const to = Math.max(arr[t.last], t.arr[t.last]) + m.precision + m.gap;
	const pairs = [];
	for(let k = t.first; k <= t.last; k++){
		[stationElement(m, t.bound, k), (k < t.last) ? sectionElement(m, t.bound, k) : -1].forEach(e => {
			if(e < 0 || (m.tracks[e].lines == 4 && !(m.tune && e % 2 == 0))) return;
			const others = (m.tracks[e].lines == 1) ? m.present[e][1].concat(m.present[e][2]) : m.present[e][t.bound];
			others.forEach(o => {
				if(o != t && exitTime(m, o, e) >= from && entryTime(m, o, e) <= to) pairs.push([e, o]);
			});
		});
	}
	return pairs;
}

// the best times of t for the mean runs `targets` (see smoothRuns()); other known times stay
function smoothTrain(m, t, targets){
	const orders = [];
	for(let k = t.first; k <= t.last; k++){
		if(t.fixed[k]) orders.push(k);
	}
	if(!orders.some(k => t.vague[k])) return;
	// its times in order: arriving at (leaving) order k, with the values each may take
	const points = [];
	orders.forEach(k => [false, true].forEach(leave => {
		if(k == (leave ? t.last : t.first)) return;
		const now = leave ? t.dep[k] : t.arr[k];
		const point = { k: k, leave: leave, values: [now] };
		if(t.vague[k]){
			const [low, high] = leave ? [t.depMin[k], t.depMax[k]] : [t.early[k], t.arrMax[k]];
			const step = Math.max(m.grid, alignUp(m, (high - low)/SMOOTH_VALUES));
			for(let time = low; time <= high; time += step){
				if(time != now) point.values.push(time);
			}
			point.center = (low + high)/2;
		}
		points.push(point);
	}));
	const centerCost = (point, time) => (point.center === undefined) ? 0 : SMOOTH_CENTER*((time - point.center)/m.precision)**2;

	let costs = points[0].values.map(time => centerCost(points[0], time));
	const back = [];
	for(let i = 1; i < points.length; i++){
		const [a, b] = [points[i - 1], points[i]];
		// a run (a leaves, b arrives at the next order) or a stop (a arrives, b leaves the same order)
		const target = a.leave ? targets.get(goldenKey(m, t, a.k, b.k, false)) : 0;
		const shortest = a.leave ? Math.min(minRun(m, t, a.k, b.k), t.arr[b.k] - t.dep[a.k]) : t.vague[a.k] ? dwellOf(m, t, a.k) : -Infinity;
		const next = [];
		back.push(b.values.map(time => {
			let best = Infinity;
			let from = -1;
			a.values.forEach((before, j) => {
				if(time - before < shortest - 1e-6) return;
				const cost = costs[j] + (a.leave ? smoothCost((time - before - target)/target) : 0);
				if(cost < best){
					best = cost;
					from = j;
				}
			});
			next.push(best + centerCost(b, time));
			return from;
		}));
		costs = next;
	}

	let j = costs.indexOf(Math.min(...costs));
	for(let i = points.length - 1; i >= 0; i--){
		const { k, leave, values } = points[i];
		if(leave) t.dep[k] = values[j];
		else t.arr[k] = values[j];
		if(i > 0) j = back[i - 1][j];
	}
	t.arr[t.first] = Math.min(t.arr[t.first], t.dep[t.first]);
	t.dep[t.last] = Math.max(t.dep[t.last], t.arr[t.last]);
	for(let i = 1; i < orders.length; i++) interpolate(m, t, orders[i - 1], orders[i]);
}

// overtaking / meeting conflicts of the trains, to check them before fine-tuning
function plainConflicts(trains){
	return countConflicts(detectConflicts(createPassingModel(trains, false)));
}

// a round yields to the browser after this long (ms), so the page keeps responding with a lot of trains
const ROUND_SLICE = 50;

/*
	Changes `trains` (a draft) round by round, yielding to the browser in between so the dashboard can update:
	first restoring (overtaking / meeting conflicts), then fine-tuning (headways too), as asked.
	onRound(round, counts, eliminated): after each round (0 = before the first one); onDone(counts, written, m): at the end.
	rounding: see createPassingModel().
	Each stage stops when few enough of its conflicts are left, after maxIteration rounds, or when the best so far
	has not improved for 3 rounds, so it ends even with maxIteration = 0.
*/
function restorePassingTimes(trains, restore, fineTune, onRound, onDone, rounding){
	const { maxIteration, maxAllowedConflict } = SETTINGS.passingTime;
	const m = createPassingModel(trains, fineTune, rounding);
	// vague stops within the running times and their order at each station first (PassingTimeSTN.js)
	if(rounding) solveNetwork(m, []);
	m.tune = !restore;
	let conflicts = detectConflicts(m);
	let best, stale, rounds;
	const startStage = () => {
		best = conflictScore(conflicts);
		stale = 0;
		rounds = 0;
	};
	const left = () => m.tune ? conflicts.length : conflicts.filter(c => c.type != "headway").length;
	let round = 0;
	startStage();
	onRound(round, countConflicts(conflicts), 0);

	const next = () => {
		if(left() <= maxAllowedConflict || (maxIteration > 0 && rounds >= maxIteration) || stale >= 3){
			if(fineTune && !m.tune){
				m.tune = true;
				startStage();
				setTimeout(next);
			}else{
				if(rounding && SETTINGS.passingTime.smooth){
					smoothRuns(m);
					conflicts = detectConflicts(m);
				}
				onDone(countConflicts(conflicts), writePassingTimes(m), m);
			}
			return;
		}
		round++;
		rounds++;
		let i = 0;
		let solved = 0;
		const work = () => {
			const until = performance.now() + ROUND_SLICE;
			while(i < conflicts.length && performance.now() < until){
				if(solveConflict(m, conflicts[i++])) solved++;
			}
			if(i < conflicts.length){
				setTimeout(work);
				return;
			}

			const previous = conflicts.length;
			conflicts = detectConflicts(m);
			const score = conflictScore(conflicts);
			if(score < best){
				best = score;
				stale = 0;
			}else{
				stale++;
			}
			if(solved == 0) stale = 3; // nothing changed, so the next round would be the same
			onRound(round, countConflicts(conflicts), previous - conflicts.length);
			setTimeout(next);
		};
		work();
	};
	setTimeout(next);
}
