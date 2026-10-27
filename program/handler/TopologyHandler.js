/*
	The topology has no file of its own: it is saved in the route json as "topology".
	Missing or invalid values are read as not secondary / no branches, so route files without it still load.
*/

// topology: "topology" of a route json (may be missing), count: number of stations
function loadTopology(topology, count){
	const kilo = value => (typeof value == "number" && value > 0) ? value : null;
	const branch = data => {
		const stations = Array.isArray(data?.stations) ? data.stations : [];
		const result = { stations: stations.map(s => newBranchStation(String(s?.name ?? ""), kilo(s?.kilo))) };
		sortBranchStations(result);
		return result;
	};
	return {
		secondary: Array.from({ length: count }, (_, i) => topology?.secondary?.[i] === true && i > 0 && i < count - 1),
		branches: Array.from({ length: count }, (_, i) => {
			const list = Array.isArray(topology?.branches?.[i]) ? topology.branches[i] : [];
			return list.map(branch).filter(b => b.stations.length > 0).slice(0, MAX_BRANCHES);
		})
	};
}
