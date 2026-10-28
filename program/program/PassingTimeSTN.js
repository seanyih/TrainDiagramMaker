/*
	Restoring passing times with a simple temporal network, see ALGORITHM_STN_PROPOSAL.md.
	Uses the model and the conflicts of PassingTime.js; headways only when fine-tuning. Each round:
	1. Every overtaking / meeting conflict proposes the nearest candidate not tried before for that pair and station:
	   x passes station s while y waits there, within y's stop (minTimeSeparation from it where the track needs it).
	   The trains of a headway that are not in another conflict with each other get a passing time at its station.
	2. All passing times that may move (fixed == 2) are solved together. Every constraint is t_j - t_i >= c, kept by
	   propagating the earliest / latest times (Bellman-Ford); a constraint that is no longer possible is left out:
	   - running times within the max speeds;
	   - the order of the trains at every station (and, on single track, where they enter and leave each element);
	   - each proposal, in order, or else it is undone;
	   - loose arrivals (PassingTime.js) between their earliest arrival and departure - stopsec;
	   - temporary stops leaving no earlier than they arrive;
	   - vague stops (imprecise timetables) within where their times were rounded from, stopping at least dwellOf();
	   - (fine-tuning) minTimeSeparation between two trains next to each other at a station, where the track needs it.
	3. Each passing time is moved as little as possible within its range, then raised where a constraint needs it.
	Unlike the rounds of PassingTime.js, a proposal may move the other passing times of its train (and of others) to fit.
	A proposal may also be x stopping at s, if an arrival there is loose: y arrives early to wait.
	y may also wait where a stop rule allows a temporary stop: its arrival and departure there are two points.
	At the end, new passing times less than timeGranularity off the line through their neighbours are dropped.
*/

// a network of `count` passing times: earliest E and latest L of each, constraints out[i] = [[j, c]] for t_j - t_i >= c
function newNetwork(count){
	return {
		E: new Float64Array(count).fill(-Infinity),
		L: new Float64Array(count).fill(Infinity),
		out: Array.from({ length: count }, () => []),
		into: Array.from({ length: count }, () => []),
		trail: [],
		edges: []
	};
}

// E[v] >= time and so on along the constraints; false if a passing time is left without any time
function raise(net, v, time){
	const queue = [[v, time]];
	for(let i = 0; i < queue.length; i++){
		const [u, t] = queue[i];
		if(t <= net.E[u]) continue;
		net.trail.push([u, net.E[u], net.L[u]]);
		net.E[u] = t;
		if(t > net.L[u]) return false;
		net.out[u].forEach(([w, c]) => queue.push([w, t + c]));
	}
	return true;
}

function lower(net, v, time){
	const queue = [[v, time]];
	for(let i = 0; i < queue.length; i++){
		const [u, t] = queue[i];
		if(t >= net.L[u]) continue;
		net.trail.push([u, net.E[u], net.L[u]]);
		net.L[u] = t;
		if(t < net.E[u]) return false;
		net.into[u].forEach(([w, c]) => queue.push([w, t - c]));
	}
	return true;
}

// b - a >= c for points { node, time } (node < 0: a known time), on the grid of timeGranularity
function constrain(m, net, a, b, c){
	if(a.node < 0 && b.node < 0) return b.time - a.time >= c;
	if(a.node < 0) return raise(net, b.node, alignUp(m, a.time + c));
	if(b.node < 0) return lower(net, a.node, alignDown(m, b.time - c));
	c = alignUp(m, c);
	net.out[a.node].push([b.node, c]);
	net.into[b.node].push([a.node, c]);
	net.edges.push([a.node, b.node]);
	return raise(net, b.node, net.E[a.node] + c) && lower(net, a.node, net.L[b.node] - c);
}

// keeps the constraints of change() only if they are still possible together with the ones before
function transaction(net, change){
	net.trail.length = 0;
	net.edges.length = 0;
	if(change()) return true;
	while(net.trail.length){
		const [v, E, L] = net.trail.pop();
		net.E[v] = E;
		net.L[v] = L;
	}
	while(net.edges.length){
		const [u, v] = net.edges.pop();
		net.out[u].pop();
		net.into[v].pop();
	}
	return false;
}

// where train t arrives at (leaves) its station order k
function stationPoint(t, k, leave){
	return leave ? { node: t.node[k], time: t.dep[k] } : { node: t.arrNode[k], time: t.arr[k] };
}

/*
	Points next to each other in time order keep their order, except the proposed ones (`moved`), whose pairs go to
	`later`. The pairs that may need minTimeSeparation go to `gaps`.
*/
function chainPoints(m, net, points, moved, later, gaps){
	points.sort((a, b) => a.time - b.time);
	let last = null;
	points.forEach((b, i) => {
		const a = points[i - 1];
		if(a && (a.node >= 0 || b.node >= 0)){
			if(moved.has(a.node) || moved.has(b.node)) later.push([a, b]);
			if(gaps) gaps.push([a, b]);
		}
		if(moved.has(b.node)) return;
		if(last && (last.node >= 0 || b.node >= 0)) transaction(net, () => constrain(m, net, last, b, 0));
		last = b;
	});
}

// from each known or passing time of t to the next, at least the min running time (scaled down where the timetable is
// faster, even at the ends of where vague stops may be)
function addRunTimes(m, net, t){
	const orders = [];
	for(let k = t.first; k <= t.last; k++){
		if(t.fixed[k]) orders.push(k);
	}
	let ratio = 1;
	for(let i = 1; i < orders.length; i++){
		const [a, b] = [orders[i - 1], orders[i]];
		if(t.fixed[a] == 1){
			let j = i;
			while(t.fixed[orders[j]] != 1) j++;
			const next = orders[j];
			ratio = Math.min(1, ((t.vague[next] ? t.arrMax[next] : t.arr[next]) - (t.vague[a] ? t.depMin[a] : t.dep[a]))/minRun(m, t, a, next));
		}
		const from = stationPoint(t, a, true);
		const to = stationPoint(t, b, false);
		if(from.node < 0 && to.node < 0) continue;
		transaction(net, () => constrain(m, net, from, to, ratio*minRun(m, t, a, b)));
	}
}

// where the trains of both bounds enter or leave single track element e at route station r (an end of the section, or the station)
function singleTrackPoints(m, e, r){
	const points = [];
	[1, 2].forEach(bound => m.present[e][bound].forEach(t => {
		const k = routeIndex(m, bound, r);
		if(!t.fixed[k]) return;
		if(e % 2 == 1){
			points.push(stationPoint(t, k, k == elementOrder(m, bound, e)));
			return;
		}
		if(k != t.first) points.push(stationPoint(t, k, false));
		if(k != t.last) points.push(stationPoint(t, k, true));
	}));
	return points;
}

// x at s within y's stop (from its arrival, unless y starts there, to its departure, unless y or x ends there),
// minTimeSeparation from it first, else the grid
function proposalRange(m, net, p, wide){
	const margin = gap => wide ? m.grid : gap ? m.gap : m.grid;
	return transaction(net, () => (p.ys == p.y.first || constrain(m, net, stationPoint(p.y, p.ys, false), stationPoint(p.t, p.s, false), margin(p.lowGap)))
		&& (p.ys == p.y.last || p.s == p.t.last || constrain(m, net, stationPoint(p.t, p.s, true), stationPoint(p.y, p.ys, true), margin(p.highGap))));
}

// the points a proposal may move
function proposalNodes(p){
	return [stationPoint(p.t, p.s, false), stationPoint(p.t, p.s, true), stationPoint(p.y, p.ys, false), stationPoint(p.y, p.ys, true)]
		.map(point => point.node).filter(v => v >= 0);
}

// step 2 above; rejected proposals are undone
function solveNetwork(m, proposals){
	let count = 0;
	m.trains.forEach(t => {
		t.node = new Int32Array(m.count).fill(-1);
		t.arrNode = new Int32Array(m.count).fill(-1);
		t.fixed.forEach((fixed, k) => {
			if(fixed == 2){
				t.node[k] = count++;
				t.arrNode[k] = t.temp[k] ? count++ : t.node[k];
			}else if(t.vague[k]){
				t.node[k] = count++;
				t.arrNode[k] = count++;
			}else if(t.loose[k]){
				t.arrNode[k] = count++;
			}
		});
		// a junction stop moves only if its range has a time on the grid
		t.junctions.forEach(j => {
			if(alignUp(m, j.min) <= alignDown(m, j.max)) t.node[j.k] = t.arrNode[j.k] = count++;
		});
	});
	const net = newNetwork(count);
	m.trains.forEach(t => t.junctions.forEach(j => {
		const v = t.node[j.k];
		if(v >= 0) [net.E[v], net.L[v]] = [alignUp(m, j.min), alignDown(m, j.max)];
	}));
	m.trains.forEach(t => t.loose.forEach((loose, k) => {
		if(!loose) return;
		net.E[t.arrNode[k]] = t.early[k];
		net.L[t.arrNode[k]] = t.dep[k] - m.stopsecs[t.bound][k];
	}));
	m.trains.forEach(t => t.vague.forEach((vague, k) => {
		if(!vague) return;
		[net.E[t.arrNode[k]], net.L[t.arrNode[k]], net.E[t.node[k]], net.L[t.node[k]]] = [t.early[k], t.arrMax[k], t.depMin[k], t.depMax[k]];
		constrain(m, net, stationPoint(t, k, false), stationPoint(t, k, true), dwellOf(m, t, k));
	}));
	m.trains.forEach(t => t.temp.forEach((temp, k) => {
		if(temp) constrain(m, net, stationPoint(t, k, false), stationPoint(t, k, true), 0);
	}));
	const moved = new Set(proposals.flatMap(proposalNodes));
	const later = [];
	const gaps = [];
	m.trains.forEach(t => addRunTimes(m, net, t));

	for(let r = 0; r < m.count; r++){
		[1, 2].forEach(bound => {
			const k = routeIndex(m, bound, r);
			const trains = m.present[2*r][bound].filter(t => t.fixed[k]);
			if(!trains.some(t => t.arrNode[k] >= 0)) return;
			chainPoints(m, net, trains.filter(t => k != t.first).map(t => stationPoint(t, k, false)), moved, later, entryGap(m, bound, k) && gaps);
			chainPoints(m, net, trains.filter(t => k != t.last).map(t => stationPoint(t, k, true)), moved, later, exitGap(m, bound, k) && gaps);
		});
	}
	m.tracks.forEach((track, e) => {
		if(track.lines > 1) return;
		const r = Math.floor(e/2);
		chainPoints(m, net, singleTrackPoints(m, e, r), moved, later, null);
		if(e % 2 == 1) chainPoints(m, net, singleTrackPoints(m, e, r + 1), moved, later, null);
	});

	// a temporary stop made by a rejected proposal is undone too, unless a kept one waits there as well
	const failed = new Set(proposals.filter(p => !proposalRange(m, net, p, false) && !proposalRange(m, net, p, true)));
	const rejected = new Set();
	proposals.forEach(p => {
		if(!failed.has(p)) return;
		if(p.passing) rejected.add(p.t.node[p.s]);
		p.undoStop = p.stop && !proposals.some(other => !failed.has(other) && other.y == p.y && other.ys == p.ys);
		if(p.undoStop) rejected.add(p.y.node[p.ys]).add(p.y.arrNode[p.ys]);
	});
	const kept = ([a, b]) => !rejected.has(a.node) && !rejected.has(b.node);
	later.filter(kept).forEach(([a, b]) => transaction(net, () => constrain(m, net, a, b, 0)));
	if(m.headway) gaps.filter(kept).forEach(([a, b]) => transaction(net, () => constrain(m, net, a, b, m.gap)));

	// nearest to the current time within [E, L], then raised along the constraints (stays within L)
	const time = new Float64Array(count);
	const offGrid = new Set();
	const nearest = (v, now) => Math.min(Math.max(Math.round(now/m.grid)*m.grid, net.E[v]), net.L[v]);
	m.trains.forEach(t => {
		t.node.forEach((v, k) => {
			if(v >= 0) time[v] = nearest(v, t.dep[k]);
		});
		t.arrNode.forEach((v, k) => {
			if(v >= 0) time[v] = nearest(v, t.arr[k]);
		});
		// an interpolated junction time stays off the grid unless it has to move
		t.junctions.forEach(j => {
			const v = t.node[j.k];
			if(v < 0 || net.E[v] > t.dep[j.k] || t.dep[j.k] > net.L[v]) return;
			time[v] = t.dep[j.k];
			offGrid.add(v);
		});
	});
	const queue = Array.from(time.keys());
	for(let i = 0; i < queue.length; i++){
		const v = queue[i];
		net.out[v].forEach(([w, c]) => {
			if(time[w] >= time[v] + c) return;
			time[w] = offGrid.has(v) ? alignUp(m, time[v] + c) : time[v] + c;
			offGrid.delete(w);
			queue.push(w);
		});
	}
	m.trains.forEach(t => {
		t.node.forEach((v, k) => {
			if(v >= 0) t.dep[k] = time[v];
		});
		t.arrNode.forEach((v, k) => {
			if(v >= 0) t.arr[k] = time[v];
		});
	});
	proposals.forEach(p => {
		if(p.passing && rejected.has(p.t.node[p.s])){
			p.t.fixed[p.s] = p.fixed;
			p.t.arr[p.s] = p.arr;
			p.t.dep[p.s] = p.dep;
		}
		if(p.undoStop){
			p.y.fixed[p.ys] = p.yFixed;
			p.y.temp[p.ys] = 0;
			p.y.arr[p.ys] = p.y.dep[p.ys] = p.yTime;
		}
	});
	m.trains.forEach(t => {
		for(let p = t.first, q = p + 1; q <= t.last; q++){
			if(!t.fixed[q]) continue;
			interpolate(m, t, p, q);
			p = q;
		}
	});
}

/*
	Candidates like addCandidates() (PassingTime.js): x passes station s near conflict c while y waits there, but without
	the max speeds (the network keeps them, moving x's other passing times if needed), and x's passing times that
	make its line through the element may be the ones that move (the network keeps their order, which may be the wrong one).
	x may also stop at s, if its or y's arrival there is loose. y may make a temporary stop at s (canStop()).
*/
function addProposals(m, c, x, y, out){
	const { maxSearchDepth } = SETTINGS.passingTime;
	const station = (c.e % 2 == 0);
	const k = elementOrder(m, x.bound, c.e);
	const end = station ? k : k + 1;
	let p = k;
	while(!x.fixed[p]) p--;
	let q = end;
	while(!x.fixed[q]) q++;

	for(let s = p; s <= q; s++){
		const distance = station ? Math.abs(s - k) : (s <= k ? k - s + 1 : s - k);
		const passing = !!x.free[s];
		if(distance > maxSearchDepth || !(passing || (x.fixed[s] == 1 && s != x.first))) continue;
		const r = routeIndex(m, x.bound, s);
		const ys = routeIndex(m, y.bound, r);
		const { lines, bits } = m.tracks[2*r];
		const stop = canStop(y, ys);
		if(!(y.wait[ys] || ys == y.first || ys == y.last || stop) || (x.bound == y.bound ? !(bits & x.bound) : lines < 2)) continue;
		// x stops at s: only if an arrival may move or y may stop, and x leaves first
		if(!passing && !((movesArrival(x, s) || movesArrival(y, ys) || stop) && (s == x.last || ys == y.last || x.dep[s] <= y.dep[ys] - m.grid))) continue;

		const same = (x.bound == y.bound);
		const proposal = {
			x: x, y: y, t: x, s: s, ys: ys, passing: passing, stop: stop && !y.temp[ys], distance: distance,
			fixed: x.fixed[s], arr: x.arr[s], dep: x.dep[s],
			lowGap: same && entryGap(m, x.bound, s),
			highGap: same && exitGap(m, x.bound, s)
		};
		if(passing){
			// y's stop, or where it may stop within its max speeds
			const [yp, yq] = stop ? knownAround(y, ys) : [];
			// a junction stop of y may move within its range
			const junction = y.junctions.find(j => j.k == ys);
			const low = (ys == y.first) ? -Infinity : stop ? y.dep[yp] + minRun(m, y, yp, ys) : movesArrival(y, ys) ? y.early[ys] : junction ? junction.min : y.arr[ys];
			const high = (ys == y.last) ? Infinity : stop ? y.arr[yq] - minRun(m, y, ys, yq) : y.vague[ys] ? y.depMax[ys] : junction ? junction.max : y.dep[ys];
			const from = alignUp(m, low + m.grid);
			const to = alignDown(m, high - m.grid);
			if(from > to) continue;
			proposal.at = Math.min(Math.max(Math.round(x.arr[s]/m.grid)*m.grid, from), to);
			proposal.move = stop ? tempStopMove(m, x, s, y, ys) : Math.abs(proposal.at - x.arr[s]);
			// y's stop is too short to keep minTimeSeparation from x where the track needs it
			proposal.tight = high - low < (proposal.lowGap ? m.gap : m.grid) + (proposal.highGap ? m.gap : m.grid);
		}else{
			proposal.move = Math.max(y.arr[ys] - x.arr[s], 0);
		}
		out.push(proposal);
	}
}

// step 1 above for an overtaking / meeting; `tried`: "x>y@s" of the candidates proposed before
function proposePassingTime(m, c, tried, proposals){
	if(!refreshConflict(m, c)) return;
	const candidates = [];
	(c.type == "cross" ? [[c.a, c.b], [c.b, c.a]] : [[c.b, c.a]]).forEach(([x, y]) => addProposals(m, c, x, y, candidates));
	const key = p => `${p.x.id}>${p.y.id}@${p.s}`;
	const proposal = candidates.sort((u, v) => !!u.tight - !!v.tight || u.distance - v.distance || u.move - v.move)
		.find(p => !tried.has(key(p)) && !(p.passing && proposals.some(other => other.passing && other.t == p.t && other.s == p.s)));
	if(!proposal) return;
	tried.add(key(proposal));
	proposals.push(proposal);
	if(proposal.stop){
		const { y, ys } = proposal;
		const [yp, yq] = knownAround(y, ys);
		proposal.yFixed = y.fixed[ys];
		proposal.yTime = y.arr[ys];
		[y.arr[ys], y.dep[ys]] = tempStopTimes(m, y, ys);
		y.fixed[ys] = 2;
		y.temp[ys] = 1;
		interpolate(m, y, yp, ys);
		interpolate(m, y, ys, yq);
	}
	if(!proposal.passing) return;
	const [sp, sq] = knownAround(proposal.t, proposal.s);
	proposal.t.fixed[proposal.s] = 2;
	proposal.t.arr[proposal.s] = proposal.t.dep[proposal.s] = proposal.at;
	interpolate(m, proposal.t, sp, proposal.s);
	interpolate(m, proposal.t, proposal.s, sq);
}

// passing times for the headways of trains that are not in another conflict with each other
// (one there would keep that conflict), left as they are for the network to move
function addHeadwayPoints(m){
	const conflicts = detectConflicts(m);
	const n = m.trains.length;
	const pairKey = c => Math.min(c.a.id, c.b.id)*n + Math.max(c.a.id, c.b.id);
	const pairs = new Set(conflicts.filter(c => c.type != "headway").map(pairKey));
	conflicts.forEach(c => {
		if(c.type != "headway" || pairs.has(pairKey(c))) return;
		[c.a, c.b].forEach(t => {
			const k = elementOrder(m, t.bound, c.e);
			if(t.free[k]) t.fixed[k] = 2;
		});
	});
}

// new passing times less than timeGranularity off the line through their neighbours, unless that makes the pairs worse
function prunePassingTimes(m){
	m.trains.forEach(t => {
		const kms = m.kms[t.bound];
		for(let s = t.first + 1; s < t.last; s++){
			if(t.fixed[s] != 2 || t.arr[s] != t.dep[s] || findStop(t.train, s)) continue;
			const [p, q] = knownAround(t, s);
			const line = t.dep[p] + (t.arr[q] - t.dep[p])*(kms[s] - kms[p])/(kms[q] - kms[p]);
			if(Math.abs(t.arr[s] - line) >= m.grid) continue;
			const attempt = newAttempt();
			watch(m, attempt, t, p, q);
			attempt.undo.push({ t: t, s: s, p: p, q: q, fixed: 2, temp: t.temp[s], arr: t.arr[s], dep: t.dep[s] });
			t.fixed[s] = 0;
			t.temp[s] = 0;
			interpolate(m, t, p, q);
			let change = 0;
			attempt.pairs.forEach(({ e, a, b, before }) => change += pairConflict(m, e, a, b) - before);
			if(change > 0) undoPassingTimes(m, attempt, 0);
		}
	});
}

/*
	Changes `trains` (a draft) round by round, yielding to the browser in between so the dashboard can update;
	fineTune: headways too. onRound(round, counts, eliminated): after each round (0 = before the first one);
	onDone(counts, written, m): at the end; rounding: see createPassingModel(). Stops when few enough conflicts are left, after maxIteration rounds,
	or when the best so far has not improved for 3 rounds.
*/
function restorePassingTimesSTN(trains, fineTune, onRound, onDone, rounding){
	const { maxIteration, maxAllowedConflict } = SETTINGS.passingTime;
	const m = createPassingModel(trains, fineTune, rounding);
	if(rounding) solveNetwork(m, []);
	const tried = new Set();
	let conflicts = detectConflicts(m);
	let best = conflictScore(conflicts);
	let stale = 0;
	let round = 0;
	onRound(round, countConflicts(conflicts), 0);

	const next = () => {
		if(conflicts.length <= maxAllowedConflict || (maxIteration > 0 && round >= maxIteration) || stale >= 3){
			// headways count when dropping passing times only if fine-tuning
			m.tune = fineTune;
			prunePassingTimes(m);
			if(rounding && SETTINGS.passingTime.smooth) smoothRuns(m);
			onDone(countConflicts(detectConflicts(m)), writePassingTimes(m), m);
			return;
		}
		round++;
		const proposals = [];
		conflicts.forEach(c => {
			if(c.type != "headway") proposePassingTime(m, c, tried, proposals);
		});
		if(fineTune) addHeadwayPoints(m);
		solveNetwork(m, proposals);

		const previous = conflicts.length;
		conflicts = detectConflicts(m);
		const score = conflictScore(conflicts);
		if(score < best){
			best = score;
			stale = 0;
		}else{
			stale++;
		}
		onRound(round, countConflicts(conflicts), previous - conflicts.length);
		setTimeout(next);
	};
	setTimeout(next);
}
