/*
	Topology graph: the main line in the first column, each branch in a column of its own.
	Images are in icon/path/ (40x50); a path ending in ".T" is the image flipped vertically.
*/

// flipped at the last station, where the branches go downwards
const FLIPPED_PATHS = ["branch.start", "branch.corner", "branch.branch"];

// clickable paths: [class, tooltip]
const PATH_BUTTONS = {
	"add_branch": ["topology-add-branch", "新增分岐"],
	"branch.add_station": ["topology-add-station", "新增車站"]
};

function renderTopologyTable(){
	$("#Topologytbody").html(ROUTE.stations.flatMap((station, i) => topologyRows(i)).join(""));
}

// station i and its branches, which are above the station (below at the last station).
// branch b is in column b + 1 and the branches left of it pass by; its farthest station is the farthest row
function topologyRows(i){
	const branches = ROUTE.topology.branches[i];
	const last = ROUTE.stations.length - 1;
	const main = (i == 0 || i == last) ? "blank_placeholder" : "pass";

	const rows = branches.flatMap((branch, b) => {
		const left = [main, ...Array(b).fill("branch.pass")];
		const stations = branch.stations.map((branchStation, k) => ({
			paths: [...left, (k == branch.stations.length - 1) ? "branch.start" : "branch.station"],
			data: `data-station="${i}" data-branch="${b}" data-index="${k}"`,
			cells: branchStationCells(ROUTE.stations[i], branchStation)
		}));
		return [{ paths: [...left, "branch.add_station"], data: `data-station="${i}" data-branch="${b}"`, cells: "<td></td><td></td>" }, ...stations.reverse()];
	});

	const type = (i == 0) ? "start" : (i == last) ? "end" : ROUTE.topology.secondary[i] ? "signal" : "station";
	const paths = [(branches.length > 0) ? `${type}_with_branch` : type];
	branches.forEach((branch, b) => paths.push((b == branches.length - 1) ? "branch.corner" : "branch.branch"));
	if(branches.length < MAX_BRANCHES) paths.push("add_branch");
	rows.push({ paths: paths, data: `data-station="${i}"`, cells: stationCells(i) });

	if(i > 0 && i == last){
		rows.reverse();
		rows.forEach(row => row.paths = row.paths.map(path => FLIPPED_PATHS.includes(path) ? `${path}.T` : path));
	}
	return rows.map(row => `
		<tr ${row.data}>
			<td class="topology-image-col"><div class="topology-image">${row.paths.map(pathImage).join("")}</div></td>
			${row.cells}
		</tr>`);
}

function pathImage(path){
	const flip = path.endsWith(".T");
	const file = flip ? path.slice(0, -2) : path;
	const [button, title] = PATH_BUTTONS[file] ?? ["", ""];
	return `<img class="${flip ? "flip" : ""} ${button}" src="../icon/path/${file}.svg" ${title ? `title="${title}"` : ""}>`;
}

// the first and last stations can't be secondary
function stationCells(i){
	const station = ROUTE.stations[i];
	const end = (i == 0 || i == ROUTE.stations.length - 1);
	return `
		<td class="topology-name">${escapeHTML(station.name)} ${station.kilo ?? ""}</td>
		<td>
			<div class="form-check">
				<input type="checkbox" class="form-check-input topology-secondary" id="topology-secondary-${i}" ${ROUTE.topology.secondary[i] ? "checked" : ""} ${end ? "disabled" : ""}>
				<label class="form-check-label" for="topology-secondary-${i}">次要車站</label>
			</div>
		</td>`;
}

// station: where the branch diverges
function branchStationCells(station, branchStation){
	return `
		<td><input class="form-control form-control-sm topology-branch-name" placeholder="站名" value="${escapeHTML(branchStation.name)}"></td>
		<td>
			<div class="aic">
				<label class="col-form-label">${escapeHTML(station.name)}站起</label>
				<input class="form-control form-control-sm topology-branch-kilo" inputmode="decimal" value="${branchStation.kilo ?? ""}">
				<label class="col-form-label">公里</label>
				<button type="button" class="btn-close topology-delete-station" title="刪除車站"></button>
			</div>
		</td>`;
}

function rowBranch(row){
	return ROUTE.topology.branches[row.data("station")][row.data("branch")];
}

function focusBranchStation(i, b, k){
	$(`#Topologytbody tr[data-station="${i}"][data-branch="${b}"][data-index="${k}"] .topology-branch-name`).trigger("focus");
}

$("#Topologytbody").on("change", ".topology-secondary", function(){
	ROUTE.topology.secondary[$(this).closest("tr").data("station")] = $(this).prop("checked");
	renderTopologyTable();
});

// a new branch has one station
$("#Topologytbody").on("click", ".topology-add-branch", function(){
	const i = $(this).closest("tr").data("station");
	const branches = ROUTE.topology.branches[i];
	branches.push({ stations: [newBranchStation()] });
	renderTopologyTable();
	focusBranchStation(i, branches.length - 1, 0);
});

// at the far end
$("#Topologytbody").on("click", ".topology-add-station", function(){
	const row = $(this).closest("tr");
	const branch = rowBranch(row);
	branch.stations.push(newBranchStation());
	renderTopologyTable();
	focusBranchStation(row.data("station"), row.data("branch"), branch.stations.length - 1);
});

// deleting the last station of a branch deletes the branch
$("#Topologytbody").on("click", ".topology-delete-station", function(){
	const row = $(this).closest("tr");
	const branches = ROUTE.topology.branches[row.data("station")];
	const branch = branches[row.data("branch")];
	branch.stations.splice(row.data("index"), 1);
	if(branch.stations.length == 0) branches.splice(row.data("branch"), 1);
	renderTopologyTable();
});

$("#Topologytbody").on("change", ".topology-branch-name", function(){
	const row = $(this).closest("tr");
	rowBranch(row).stations[row.data("index")].name = $(this).val().trim();
});

// kept sorted; re-rendered only when the order changes, so the focus stays otherwise
$("#Topologytbody").on("change", ".topology-branch-kilo", function(){
	const value = $(this).val().trim();
	const kilo = Number(value);
	if(value != "" && !(kilo > 0)){
		$(this).css("background-color", "red");
		return;
	}
	const row = $(this).closest("tr");
	const branch = rowBranch(row);
	const branchStation = branch.stations[row.data("index")];
	branchStation.kilo = (value == "") ? null : kilo;

	const order = branch.stations.slice();
	sortBranchStations(branch);
	if(branch.stations.some((s, k) => s !== order[k])) renderTopologyTable();
	else $(this).css("background-color", "").val(branchStation.kilo ?? "");
});
