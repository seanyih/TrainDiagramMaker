/*
	Auto-fill: copies the running times of a golden train (one with its passing times filled in) to trains of its bound.
	Only blank stations between two stops of a target are filled, where the golden has times too.
	The golden's running times (dwell times left out) are stretched to fit the target's own times at those two stops,
	so the target keeps its range and every time it already has; at the end of the golden's range only one stop is used.
*/

// "*" = any characters, "." = any one character, the rest is literal
function wildcardRegExp(pattern){
	return new RegExp(`^${pattern.replace(/[\^$+?()[\]{}|\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
}

// { bound, train } of the first train with this number, or null
function findTrainByNumber(trains, number){
	for(const bound of [1, 2]){
		const train = trains[bound].find(train => train.train_number == number);
		if(train) return { bound: bound, train: train };
	}
	return null;
}

/*
	conditions: { number, color, name }, null = not used; number and name are wildcard patterns.
	Returns [{ train, stops }]: the trains of the bound that would change, with their new stops
*/
function computeAutofill(trains, bound, golden, conditions){
	const stations = boundStations(bound);
	const number = (conditions.number === null) ? null : wildcardRegExp(conditions.number);
	const name = (conditions.name === null) ? null : wildcardRegExp(conditions.name);

	// clock[order]: running time from the golden's first stop, without dwell times
	const clock = [];
	const stops = stopTimes(golden, stations);
	stops.forEach((stop, i) => {
		clock[stop.order] = (i == 0) ? 0 : clock[stops[i - 1].order] + stop.arr - stops[i - 1].dep;
	});

	return trains[bound]
		.filter(train => train != golden
			&& (number === null || number.test(train.train_number))
			&& (conditions.color === null || train.settings.train_color == conditions.color)
			&& (name === null || name.test(train.settings.train_name)))
		.map(train => ({ train: train, stops: autofillStops(train, clock, stations, SETTINGS.passingTime.timeGranularity) }))
		.filter(result => result.stops.length > 0);
}

// times are rounded to multiples of `grid` seconds
function autofillStops(train, clock, stations, grid){
	const filled = new Set(train.timetable.map(stop => stop.station_order));
	const stops = stopTimes(train, stations);
	const result = [];
	for(let i = 0; i + 1 < stops.length; i++){
		const p = stops[i];
		const n = stops[i + 1];
		const cp = clock[p.order];
		const cn = clock[n.order];
		for(let k = p.order + 1; k < n.order; k++){
			if(filled.has(k) || clock[k] === undefined) continue;
			let time;
			if(cp !== undefined && cn !== undefined) time = p.dep + (n.arr - p.dep)*(clock[k] - cp)/(cn - cp);
			else if(cp !== undefined)                time = p.dep + clock[k] - cp;
			else if(cn !== undefined)                time = n.arr - (cn - clock[k]);
			time = Math.round(time/grid)*grid;
			if(!(time > p.dep && time < n.arr)) continue;

			const str = toStr(time % 86400);
			result.push({ station_order: k, station_name: stations[k].name, arrival: str, departure: str });
		}
	}
	return result;
}

function applyAutofill(results){
	results.forEach(({ train, stops }) => {
		train.timetable.push(...stops);
		train.timetable.sort((a, b) => a.station_order - b.station_order);
	});
}
