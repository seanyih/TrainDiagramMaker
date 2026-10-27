/*
	Train number placement.
	A number is placed every pxPerTrainNumber px of travel, inside an interval between two adjacent route stations.
	Intervals shorter than minStationIntervalForTrainNumber are skipped and the number is postponed to the next one.
	The number slides along the train line to avoid other train lines, numbers and (optionally) time lines,
	keeping trainNumberAvoidance.margin away from them, without crossing the station lines of its interval;
	if no position is free, that number is dropped. With avoidance disabled, only the station lines are respected.
*/

const TRAIN_NUMBER_GAP = 3; // px between the train line and the text
const MIN_PX_TO_AVOID_SECONDARY_LINES = 250; // hard limit, so that a free position can still exist

function canAvoidSecondaryLines(){
	return SETTINGS.lines.secondary.interval*SETTINGS.pxPerMin >= MIN_PX_TO_AVOID_SECONDARY_LINES;
}

function shouldAvoidTimeLine(primary){
	const avoid = SETTINGS.trainNumberAvoidance;
	if(!avoid.enabled) return false;
	return primary ? avoid.primaryTimeLines : (avoid.secondaryTimeLines && canAvoidSecondaryLines());
}

// uniform grid of line segments, for fast collision queries
function createSegmentGrid(cellSize = 100){
	return { cellSize: cellSize, cells: new Map(), queryId: 0 };
}

// stops and returns true as soon as fn(key) returns true
function someCell(grid, minX, minY, maxX, maxY, fn){
	const s = grid.cellSize;
	for(let cx = Math.floor(minX/s); cx <= Math.floor(maxX/s); cx++){
		for(let cy = Math.floor(minY/s); cy <= Math.floor(maxY/s); cy++){
			if(fn(cx*1048576 + cy)) return true;
		}
	}
	return false;
}

// seg = { x1, y1, x2, y2, owner }; its bounding box is stored on it
function addSegment(grid, seg){
	seg.minX = Math.min(seg.x1, seg.x2);
	seg.minY = Math.min(seg.y1, seg.y2);
	seg.maxX = Math.max(seg.x1, seg.x2);
	seg.maxY = Math.max(seg.y1, seg.y2);
	someCell(grid, seg.minX, seg.minY, seg.maxX, seg.maxY, key => {
		if(!grid.cells.has(key)) grid.cells.set(key, []);
		grid.cells.get(key).push(seg);
	});
}

// whether fn(seg) is true for any segment whose bounding box overlaps the area; each segment is tested once
function someSegment(grid, minX, minY, maxX, maxY, fn){
	const query = ++grid.queryId;
	return someCell(grid, minX, minY, maxX, maxY, key => (grid.cells.get(key) || []).some(seg => {
		if(seg.query === query) return false;
		seg.query = query;
		return seg.maxX >= minX && seg.minX <= maxX && seg.maxY >= minY && seg.minY <= maxY && fn(seg);
	}));
}

/*
	box: rotated rectangle { cx, cy, u, up, hl, hh }
	u = unit vector along the text, up = unit vector to the top of the text, hl / hh = half length / half height
*/
function boxCorners(box){
	return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => ({
		x: box.cx + a*box.u.x*box.hl + b*box.up.x*box.hh,
		y: box.cy + a*box.u.y*box.hl + b*box.up.y*box.hh
	}));
}

// Liang-Barsky clipping in the box's local coordinates
function segmentHitsBox(seg, box){
	const local = (x, y) => ({
		x: (x - box.cx)*box.u.x + (y - box.cy)*box.u.y,
		y: (x - box.cx)*box.up.x + (y - box.cy)*box.up.y
	});
	const p = local(seg.x1, seg.y1);
	const q = local(seg.x2, seg.y2);
	const dx = q.x - p.x;
	const dy = q.y - p.y;
	let t0 = 0;
	let t1 = 1;

	// keep the part of the segment where den*t <= num
	const clip = (den, num) => {
		if(den == 0) return num >= 0;
		const t = num/den;
		if(den > 0){
			if(t < t0) return false;
			t1 = Math.min(t1, t);
		}else{
			if(t > t1) return false;
			t0 = Math.max(t0, t);
		}
		return true;
	};
	return clip(-dx, p.x + box.hl) && clip(dx, box.hl - p.x) && clip(-dy, p.y + box.hh) && clip(dy, box.hh - p.y);
}

function textWidth(str, fontSize){
	return [...str].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 255 ? 1 : 0.6), 0)*fontSize;
}

// no segment of another owner within `margin` px of the box
function isClear(box, train, grid, margin){
	const clearance = { ...box, hl: box.hl + margin, hh: box.hh + margin };
	const corners = boxCorners(clearance);
	const xs = corners.map(c => c.x);
	const ys = corners.map(c => c.y);
	return !someSegment(grid, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), seg => seg.owner !== train && segmentHitsBox(seg, clearance));
}

// returns { box, x, y } (y = baseline) or null if no free position in this slot
function findTrainNumberPosition(slot, train, grid, w){
	const fontSize = SETTINGS.trainNumberFontSize;
	const left = SETTINGS.margin.left;
	const dx = slot.x2 - slot.x1;
	const dy = slot.y2 - slot.y1;
	const len = Math.hypot(dx, dy);
	const u = { x: dx/len, y: dy/len };
	const up = { x: u.y, y: -u.x };
	const yMin = Math.min(slot.y1, slot.y2);
	const yMax = Math.max(slot.y1, slot.y2);
	const step = fontSize/2;
	const avoid = SETTINGS.trainNumberAvoidance;

	// try the middle first, then alternately further forward / backward
	for(let k = 0; k*step <= len/2; k++){
		for(const offset of (k == 0) ? [0] : [k*step, -k*step]){
			let px = slot.x1 + dx/2 + u.x*offset;
			const py = slot.y1 + dy/2 + u.y*offset;
			if(px > left + w) px -= w; // overnight part is drawn on the left

			const box = {
				cx: px + up.x*(TRAIN_NUMBER_GAP + fontSize/2),
				cy: py + up.y*(TRAIN_NUMBER_GAP + fontSize/2),
				u: u, up: up,
				hl: textWidth(train.train_number, fontSize)/2,
				hh: fontSize/2
			};
			const corners = boxCorners(box);
			const ys = corners.map(c => c.y);
			if(Math.min(...ys) <= yMin || Math.max(...ys) >= yMax) continue;

			if(!avoid.enabled || isClear(box, train, grid, avoid.margin)){
				return {
					box: box,
					x: px + up.x*(TRAIN_NUMBER_GAP + fontSize*0.2),
					y: py + up.y*(TRAIN_NUMBER_GAP + fontSize*0.2)
				};
			}
		}
	}
	return null;
}

// trainSlots: [{ train, slots }] from drawTrain()
function placeTrainNumbers(o, trainSlots, grid, w){
	const { pxPerTrainNumber, minStationIntervalForTrainNumber, trainNumberFontSize } = SETTINGS;

	trainSlots.forEach(({ train, slots }) => {
		if(!train.train_number) return;
		const c = SETTINGS.trainColors[train.settings.train_color];
		let n = 1;

		slots.forEach(slot => {
			if(slot.traveled <= pxPerTrainNumber*n) return;
			if(Math.abs(slot.y2 - slot.y1) < minStationIntervalForTrainNumber) return;

			const pos = findTrainNumberPosition(slot, train, grid, w);
			if(pos){
				const angle = Math.atan2(pos.box.u.y, pos.box.u.x)*180/Math.PI;
				o.append(makeSVGtext("text", train.train_number, {x:pos.x, y:pos.y, "font-family":"Noto Sans TC", "font-size":trainNumberFontSize, "text-anchor":"middle", "fill":c, "transform":`rotate(${angle} ${pos.x} ${pos.y})`, "font-weight":"bold"}));

				// later numbers avoid this one: its edges and diagonals as segments
				const corners = boxCorners(pos.box);
				[[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3]].forEach(([a, b]) => {
					addSegment(grid, {x1: corners[a].x, y1: corners[a].y, x2: corners[b].x, y2: corners[b].y, owner: "label"});
				});
			}
			// next number after the next full pxPerTrainNumber
			n = Math.floor(slot.traveled/pxPerTrainNumber) + 1;
		});
	});
}
