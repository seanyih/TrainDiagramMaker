/*
	OuDia (.oud, Shift_JIS) / OuDiaSecond (.oud2, UTF-8) import: the route, the trains of one dia, and the diagram colors;
	export: the route and the trains as one dia (oudText()).
	The format and the conversion are in DATA_STRUCTURE.md and design_doc/OUDIA.md.
*/

let OUD_FILE = null; // the parsed file chosen in #OudFile

const OUD_LINE_TYPES = { SenStyle_Jissen: "solid", SenStyle_Hasen: "dashed", SenStyle_Tensen: "dotted", SenStyle_Ittensasen: "dashed" };

// UTF-8 (.oud2) if it decodes, otherwise Shift_JIS (.oud)
function decodeOud(buffer){
	try{
		return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^﻿/, "");
	}catch(e){
		return new TextDecoder("shift_jis").decode(buffer);
	}
}

// "Name." opens a node, "." closes it, "key=value" lines are its values (a key may repeat)
function parseOud(text){
	const root = { name: "", values: {}, children: [] };
	const stack = [root];
	text.split(/\r?\n/).forEach(line => {
		const node = stack[stack.length - 1];
		const eq = line.indexOf("=");
		if(line == "."){
			if(stack.length > 1) stack.pop();
		}else if(eq < 0 && line.endsWith(".")){
			const child = { name: line.slice(0, -1), values: {}, children: [] };
			node.children.push(child);
			stack.push(child);
		}else if(eq > 0){
			(node.values[line.slice(0, eq)] ??= []).push(line.slice(eq + 1));
		}
	});
	return root;
}

function oudValue(node, key, i = 0){
	return node?.values[key]?.[i] ?? "";
}

function oudChildren(node, name){
	return node ? node.children.filter(child => child.name == name) : [];
}

// "00BBGGRR" -> "#RRGGBB"
function oudColor(str){
	const hex = str.padStart(8, "0");
	return `#${hex.slice(6, 8)}${hex.slice(4, 6)}${hex.slice(2, 4)}`.toUpperCase();
}

// one EkiJikoku cell: kind 0 = not running, 1 = stop, 2 = pass, 3 = not via (old files)
function parseEkiJikoku(cell){
	const [main] = cell.split("$");
	if(!main) return { kind: 0, arr: "", dep: "" };
	const [kind, times = ""] = main.split(";");
	const [arr, dep] = times.includes("/") ? times.split("/") : ["", times];
	const time = str => normalizeTime(str) || "";
	return { kind: Number(kind), arr: time(arr), dep: time(dep) };
}

function oudRessyaCells(ressya){
	return oudValue(ressya, "EkiJikoku").split(",").map(parseEkiJikoku);
}

/*
	Seconds between route stations i and i + 1, as OuDia spaces them: the shortest run of a train stopping at both
	(or of any train with times there), the longer of the two directions; NextEkiDistance overrides
*/
function oudSectionSeconds(rosen, dia, count){
	const fallback = Number(oudValue(rosen, "DiagramDgrYZahyouKyoriDefault")) || 60;
	const eki = oudChildren(rosen, "Eki");
	const sections = Array.from({ length: count - 1 }, () => []);

	[["Kudari", 1], ["Nobori", 2]].forEach(([name, bound]) => {
		const best = Array.from({ length: count - 1 }, () => ({ stop: Infinity, any: Infinity }));
		oudChildren(oudChildren(dia, name)[0], "Ressya").forEach(ressya => {
			const cells = oudRessyaCells(ressya);
			for(let k = 0; k < Math.min(cells.length, count) - 1; k++){
				const from = cells[k].dep || cells[k].arr;
				const to = cells[k + 1].arr || cells[k + 1].dep;
				if(!from || !to) continue;
				const sec = (toSec(to) - toSec(from) + 86400) % 86400;
				if(sec == 0) continue;
				const b = best[(bound == 1) ? k : count - 2 - k];
				b.any = Math.min(b.any, sec);
				if(cells[k].kind == 1 && cells[k + 1].kind == 1) b.stop = Math.min(b.stop, sec);
			}
		});
		best.forEach((b, i) => {
			const sec = isFinite(b.stop) ? b.stop : b.any;
			if(isFinite(sec)) sections[i].push(sec);
		});
	});

	return sections.map((secs, i) => Number(oudValue(eki[i], "NextEkiDistance")) || (secs.length ? Math.max(...secs) : fallback));
}

/*
	The trains of one direction. A train is split where it does not run between its first and last station,
	since our train lines are continuous. slotOf: Syubetsu index -> train_color
*/
function oudTrains(ressyaList, count, types, slotOf){
	const trains = [];
	let split = 0;
	ressyaList.forEach(ressya => {
		const typeIndex = Number(oudValue(ressya, "Syubetsu"));
		const name = oudValue(ressya, "Ressyamei");
		const gousuu = oudValue(ressya, "Gousuu");
		const trainName = name ? `${name}${gousuu ? ` ${gousuu}号` : ""}` : (types[typeIndex]?.name ?? "");

		const parts = [];
		let train = null;
		oudRessyaCells(ressya).slice(0, count).forEach((cell, order) => {
			if(cell.kind == 0 || cell.kind == 3){
				train = null;
				return;
			}
			const time = cell.dep || cell.arr;
			if(!time) return;
			if(!train){
				train = newTrain(oudValue(ressya, "Ressyabangou"), trainName, slotOf[typeIndex] ?? 0);
				parts.push(train);
			}
			// a pass has one time; a stop without its arrival time keeps it blank (unknown)
			if(cell.kind == 2) addStop(train, order, time, time);
			else               addStop(train, order, cell.arr, cell.dep || cell.arr);
		});

		// no dwell at the ends
		parts.forEach(part => {
			[part.timetable[0], part.timetable[part.timetable.length - 1]].forEach(stop => {
				if(!stop.arrival) stop.arrival = stop.departure;
			});
		});
		split += Math.max(parts.length - 1, 0);
		trains.push(...parts);
	});
	return { trains, split };
}

/*
	Train types grouped by line color, type and boldness into color slots 1 ~ 10, in order of first use;
	more groups than slots share the slot of the nearest color
*/
function oudColorSlots(types, usedTypes){
	const groups = [];
	const slotOf = {};
	let merged = false;
	const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
	const distance = (a, b) => rgb(a).reduce((sum, v, i) => sum + (v - rgb(b)[i])**2, 0);

	usedTypes.forEach(index => {
		const type = types[index];
		if(!type) return;
		const key = `${type.color}|${type.lineType}|${type.bold}`;
		let slot = groups.findIndex(group => group.key == key);
		if(slot < 0 && groups.length < 10){
			groups.push({ key, ...type });
			slot = groups.length - 1;
		}else if(slot < 0){
			merged = true;
			slot = groups.reduce((best, group, i) => distance(group.color, type.color) < distance(groups[best].color, type.color) ? i : best, 0);
		}
		slotOf[index] = slot + 1;
	});
	return { groups, slotOf, merged };
}

// everything needed to apply the file's dia `diaIndex`
function convertOud(root, diaIndex){
	const rosen = oudChildren(root, "Rosen")[0];
	const eki = oudChildren(rosen, "Eki");
	const dia = oudChildren(rosen, "Dia")[diaIndex];
	const count = eki.length;

	const types = oudChildren(rosen, "Ressyasyubetsu").map(node => ({
		name: oudValue(node, "Syubetsumei"),
		color: oudColor(oudValue(node, "DiagramSenColor")),
		lineType: OUD_LINE_TYPES[oudValue(node, "DiagramSenStyle")] ?? "solid",
		bold: oudValue(node, "DiagramSenIsBold") == "1"
	}));
	const ressya = ["Kudari", "Nobori"].map(name => oudChildren(oudChildren(dia, name)[0], "Ressya"));
	const usedTypes = [...new Set(ressya.flat().map(r => Number(oudValue(r, "Syubetsu"))))].sort((a, b) => a - b);
	const { groups, slotOf, merged } = oudColorSlots(types, usedTypes);

	let kilo = 0;
	const seconds = oudSectionSeconds(rosen, dia, count);
	const stations = eki.map((node, i) => {
		if(i > 0) kilo += seconds[i - 1]/60;
		return newStation(oudValue(node, "Ekimei"), Math.round(kilo*100)/100, SETTINGS.defaultStopSec, "");
	});
	const topology = newTopology(count);
	eki.forEach((node, i) => {
		topology.secondary[i] = i > 0 && i < count - 1 && oudValue(node, "Ekikibo") != "Ekikibo_Syuyou";
	});

	const [down, up] = ressya.map(list => oudTrains(list, count, types, slotOf));
	const dispProp = oudChildren(root, "DispProp")[0];
	const kiten = normalizeTime(oudValue(rosen, "KitenJikoku")) || "0000";
	return {
		route: { route_name: oudValue(rosen, "Rosenmei"), stations, track_layout: newTrackLayout(count), topology },
		trains: { 1: down.trains, 2: up.trains },
		colors: groups,
		background: dispProp?.values.DiaBackColor ? oudColor(oudValue(dispProp, "DiaBackColor")) : null,
		axis: dispProp?.values.DiaJikuColor ? oudColor(oudValue(dispProp, "DiaJikuColor")) : null,
		startSec: toSec(kiten),
		merged: merged,
		split: down.split + up.split
	};
}

function applyOud(data){
	applyRoute(data.route);
	applyTrains(1, data.trains[1], false);
	applyTrains(2, data.trains[2], false);

	for(let n = 1; n <= 10; n++){
		SETTINGS.trainLineTypeByColor[n] = "";
		SETTINGS.trainLineWidthByColor[n] = null;
	}
	data.colors.forEach((group, i) => {
		SETTINGS.trainColors[i + 1] = group.color;
		SETTINGS.trainLineTypeByColor[i + 1] = group.lineType;
		SETTINGS.trainLineWidthByColor[i + 1] = group.bold ? SETTINGS.trainLineWidth*2 : null;
	});
	SETTINGS.trainColors[0] = SETTINGS.trainColors[1];
	if(data.background) SETTINGS.background.color = data.background;
	if(data.axis) SETTINGS.oudiaStyle.axisColor = data.axis;
	SETTINGS.startSec = data.startSec;
	SETTINGS.endSec = Math.min(data.startSec + 86400, MAX_END_SEC);
	initSettingsUI();
}

$("body").on("change", "#OudFile", function(){
	OUD_FILE = null;
	$("#OudDia").html("");
	const [file] = this.files;
	if(!file) return;

	const reader = new FileReader();
	reader.addEventListener("load", () => {
		const root = parseOud(decodeOud(reader.result));
		const rosen = oudChildren(root, "Rosen")[0];
		const dias = oudChildren(rosen, "Dia");
		if(oudChildren(rosen, "Eki").length < 2 || dias.length == 0){
			$("#ImportOudFailed").toast('show');
			return;
		}
		OUD_FILE = root;
		$("#OudDia").html(dias.map((dia, i) => `<option value="${i}">${escapeHTML(oudValue(dia, "DiaName") || `ダイヤ ${i + 1}`)}</option>`).join(""));
	});
	reader.readAsArrayBuffer(file);
});

$("body").on("click", "#ImportOudBtn", function(){
	if(!OUD_FILE){
		$("#ImportOudFailed").toast('show');
		return;
	}
	const data = convertOud(OUD_FILE, Number($("#OudDia").val()));
	applyOud(data);
	generateTimetable();
	$("#ImportOudSuccess").toast('show');

	const reasons = ["里程是依最短運轉時間推算的 (1 分鐘 = 1 公里)"];
	if(data.merged) reasons.push("種別的線條樣式超過 10 種，部分種別共用顏色");
	if(data.split > 0) reasons.push(`${data.split} 處中途不經由，列車在該處拆成兩班`);
	$("#ImportOudReason").html(reasons.join("；"));
	$("#ImportOudWarning").toast('show');
});

const OUD_SEN_STYLES = { solid: "SenStyle_Jissen", dashed: "SenStyle_Hasen", dotted: "SenStyle_Tensen" };

// "#RRGGBB" -> "00BBGGRR"
function toOudColor(hex){
	return `00${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}`.toUpperCase();
}

// "hhmm[ss]" -> OuDia's "hmm[ss]"
function toOudTime(str){
	return `${Number(str.slice(0, 2)) % 24}${str.slice(2)}`;
}

// one EkiJikoku cell of a stop: a pass with its time, or a stop (arrival only at the last one)
function oudStopCell(stop, first, last){
	const t = toOudTime;
	if(!first && !last && stop.arrival == stop.departure) return `2;${t(stop.departure)}`;
	if(last) return `1;${t(stop.arrival || stop.departure)}/`;
	return (stop.arrival && stop.arrival != stop.departure) ? `1;${t(stop.arrival)}/${t(stop.departure)}` : `1;${t(stop.departure)}`;
}

// cells in the train's direction: "" outside its run, "2" (pass, no time) between its stops
function oudEkiJikoku(train, count){
	const cells = Array(count).fill("");
	const stops = train.timetable.filter(stop => stop.arrival || stop.departure);
	if(stops.length == 0) return "";
	for(let k = stops[0].station_order + 1; k < stops[stops.length - 1].station_order; k++) cells[k] = "2";
	stops.forEach((stop, j) => cells[stop.station_order] = oudStopCell(stop, j == 0, j == stops.length - 1));
	return cells.join(",");
}

/*
	The route and both directions as an .oud (OuDia.1.02) or .oud2 (OuDiaSecond.1.17) text.
	Each train color is a Syubetsu, named after its trains if they all have the same name;
	.oud2 keeps the kilos as NextEkiDistance (1 km = 60 s, how convertOud() reads it back)
*/
function oudText(second){
	const stations = ROUTE.stations;
	const count = stations.length;
	const trains = [1, 2].flatMap(bound => TRAINS[bound].map(train => ({ bound, train })));

	const dwell = stations.map(() => false);
	trains.forEach(({ bound, train }) => train.timetable.forEach(stop => {
		if(stop.arrival && stop.arrival != stop.departure) dwell[(bound == 1) ? stop.station_order : count - 1 - stop.station_order] = true;
	}));

	const slots = [...new Set(trains.map(({ train }) => train.settings.train_color))].sort((a, b) => a - b);
	if(slots.length == 0) slots.push(0);
	const typeName = {};
	const lines = [`FileType=${second ? "OuDiaSecond.1.17" : "OuDia.1.02"}`, "Rosen.", `Rosenmei=${ROUTE.route_name}`];
	stations.forEach((station, i) => {
		lines.push("Eki.", `Ekimei=${station.name}`,
			`Ekijikokukeisiki=${dwell[i] ? "Jikokukeisiki_Hatsuchaku" : "Jikokukeisiki_Hatsu"}`,
			`Ekikibo=${ROUTE.topology.secondary[i] ? "Ekikibo_Ippan" : "Ekikibo_Syuyou"}`);
		if(second && i < count - 1) lines.push(`NextEkiDistance=${Math.max(Math.round((stations[i + 1].kilo - station.kilo)*60), 1)}`);
		lines.push(".");
	});
	slots.forEach(slot => {
		const names = [...new Set(trains.filter(({ train }) => train.settings.train_color == slot).map(({ train }) => train.settings.train_name))];
		typeName[slot] = (names.length == 1 && names[0]) ? names[0] : null;
		const color = toOudColor(SETTINGS.trainColors[slot]);
		const width = SETTINGS.trainLineWidthByColor[slot] ?? SETTINGS.trainLineWidth;
		lines.push("Ressyasyubetsu.", `Syubetsumei=${typeName[slot] ?? (slot ? `顏色${slot}` : "未指定")}`,
			`JikokuhyouMojiColor=${color}`, `DiagramSenColor=${color}`,
			`DiagramSenStyle=${OUD_SEN_STYLES[SETTINGS.trainLineTypeByColor[slot] || SETTINGS.trainLineType]}`,
			...(width >= SETTINGS.trainLineWidth*2 ? ["DiagramSenIsBold=1"] : []),
			"StopMarkDrawType=EStopMarkDrawType_DrawOnStop", ".");
	});

	lines.push("Dia.", "DiaName=ダイヤ");
	[["Kudari", 1], ["Nobori", 2]].forEach(([houkou, bound]) => {
		lines.push(`${houkou}.`);
		TRAINS[bound].forEach(train => {
			const { train_name, train_color } = train.settings;
			// "name 3号" -> Ressyamei, Gousuu
			const [, name, gousuu] = train_name.match(/^(.*?)\s*(\d+)号$/) ?? [null, train_name, ""];
			lines.push("Ressya.", `Houkou=${houkou}`, `Syubetsu=${slots.indexOf(train_color)}`, `Ressyabangou=${train.train_number}`,
				...(typeName[train_color] == null && name ? [`Ressyamei=${name}`] : []),
				...(typeName[train_color] == null && gousuu ? [`Gousuu=${gousuu}`] : []),
				`EkiJikoku=${oudEkiJikoku(train, count)}`, ".");
		});
		lines.push(".");
	});
	lines.push(".", `KitenJikoku=${toOudTime(secToHhmm(SETTINGS.startSec % 86400))}`, "DiagramDgrYZahyouKyoriDefault=60", "Comment=", ".",
		"DispProp.", `DiaBackColor=${toOudColor(SETTINGS.background.color)}`, `DiaJikuColor=${toOudColor(SETTINGS.oudiaStyle.axisColor)}`, ".");
	return lines.join("\r\n") + "\r\n";
}

// Shift_JIS (Windows-31J) bytes of each character, taken from the decoder
let SJIS_TABLE = null;

// { bytes, missing }: characters Shift_JIS lacks become "?"
function encodeShiftJIS(text){
	if(!SJIS_TABLE){
		SJIS_TABLE = new Map();
		const decoder = new TextDecoder("shift_jis");
		for(let b = 0xA1; b <= 0xDF; b++) SJIS_TABLE.set(decoder.decode(new Uint8Array([b])), [b]);
		for(let lead = 0x81; lead <= 0xFC; lead++){
			if(lead > 0x9F && lead < 0xE0) continue;
			for(let trail = 0x40; trail <= 0xFC; trail++){
				const ch = decoder.decode(new Uint8Array([lead, trail]));
				if(trail != 0x7F && ch.length == 1 && ch != "�" && !SJIS_TABLE.has(ch)) SJIS_TABLE.set(ch, [lead, trail]);
			}
		}
	}
	let missing = 0;
	const bytes = [];
	for(const ch of text){
		const code = ch.codePointAt(0);
		if(code < 0x80){
			bytes.push(code);
		}else if(SJIS_TABLE.has(ch)){
			bytes.push(...SJIS_TABLE.get(ch));
		}else{
			bytes.push(0x3F);
			missing++;
		}
	}
	return { bytes: new Uint8Array(bytes), missing };
}

$("body").on("click", ".export-oud-btn", function(){
	const second = $(this).data("format") == "oud2";
	const fileName = $("#ExportOudFilename").val() || ROUTE.route_name || "TrainDiagram";
	const text = oudText(second);
	if(second){
		downloadFile(`${fileName}.oud2`, `﻿${text}`);
		return;
	}
	const { bytes, missing } = encodeShiftJIS(text);
	downloadFile(`${fileName}.oud`, bytes);
	if(missing > 0){
		$("#ExportOudMissing").text(missing);
		$("#ExportOudWarning").toast('show');
	}
});
