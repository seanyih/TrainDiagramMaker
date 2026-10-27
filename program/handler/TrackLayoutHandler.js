/*
	The track layout has no file of its own: it is saved in the route json as "track_layout".
	Missing or unknown values are read as DEFAULT_TRACK (max speeds: null), so route files without it still load.
*/

// layout: "track_layout" of a route json (may be missing), count: number of stations
function loadTrackLayout(layout, count){
	const read = (list, length) => Array.from({ length: length }, (_, i) => TRACK_TYPES.includes(list?.[i]) ? list[i] : DEFAULT_TRACK);
	const speed = value => (typeof value == "number" && value > 0) ? value : null;
	const enabled = layout?.max_speed_enabled !== false;
	return {
		stations: read(layout?.stations, count),
		sections: read(layout?.sections, count - 1),
		max_speed_enabled: enabled,
		max_speed_all: enabled ? speed(layout?.max_speed_all) : null,
		max_speeds: Array.from({ length: count - 1 }, (_, i) => enabled ? speed(layout?.max_speeds?.[i]) : null)
	};
}
