/*
	The detailed result of restoring passing times (基本設定 > 待避時間計算 > 詳細結果), from the solver's model at the end
	(after writePassingTimes()): the conflicts left, why the solver stopped, how close the result comes to each limit
	and, for each conflict left, why the stations near it could not solve it. The trial runs of the greedy solver
	(PassingTime.js) used for that are always undone, so the model is not changed.
	Text only; the UI (passingTimeInput.js) escapes it.
*/

// conflicts left that are looked into (each costs a few trial runs)
const REPORT_DIAGNOSED = 100;

const BOUND_NAMES = { 1: "順行", 2: "逆行" };

function reportTrain(t){
	return `${t.train.train_number || "(無車次)"}次`;
}

// hh:mm:ss
function reportClock(time){
	const sec = ((Math.round(time) % 86400) + 86400) % 86400;
	return [Math.floor(sec/3600), Math.floor(sec/60) % 60, sec % 60].map(n => String(n).padStart(2, "0")).join(":");
}

function reportStation(m, bound, k){
	return ROUTE.stations[routeIndex(m, bound, k)].name;
}

// a station, or a section as "A=B" (route order)
function reportElement(e){
	const r = Math.floor(e/2);
	return (e % 2 == 0) ? ROUTE.stations[r].name : `${ROUTE.stations[r].name}=${ROUTE.stations[r + 1].name}`;
}

// what t does at its station order k: arriving (`leave` false) or leaving
function stopEvent(t, k, leave){
	if(t.arr[k] == t.dep[k] && !t.vague[k]) return "通過";
	return leave ? "出發" : "到達";
}

// "A站順行 1次通過 (hh:mm:ss) 2次出發 (hh:mm:ss), Δ = 30 s": u before v at their station order k
function reportGap(m, u, v, k, leave){
	const time = t => leave ? t.dep[k] : t.arr[k];
	const event = t => `${reportTrain(t)}${stopEvent(t, k, leave)} (${reportClock(time(t))})`;
	return `${reportStation(m, u.bound, k)}${BOUND_NAMES[u.bound]} ${event(u)} ${event(v)}, Δ = ${Math.round(time(v) - time(u))} s`;
}

// the sides of the station of headway c where its trains are too close: false = arriving, true = leaving
function headwaySides(m, c){
	const k = elementOrder(m, c.a.bound, c.e);
	const sides = [];
	if(k != c.a.first && k != c.b.first && Math.abs(c.a.arr[k] - c.b.arr[k]) < m.gap && entryGap(m, c.a.bound, k)) sides.push(false);
	if(k != c.a.last && k != c.b.last && Math.abs(c.a.dep[k] - c.b.dep[k]) < m.gap && exitGap(m, c.a.bound, k)) sides.push(true);
	return sides;
}

// one line for a conflict; an overtaking names the train that overtakes first
function describeConflict(m, c){
	if(c.type == "headway"){
		const k = elementOrder(m, c.a.bound, c.e);
		return headwaySides(m, c).map(leave => {
			const time = t => leave ? t.dep[k] : t.arr[k];
			const [u, v] = (time(c.a) <= time(c.b)) ? [c.a, c.b] : [c.b, c.a];
			return reportGap(m, u, v, k, leave);
		}).filter((text, i, all) => all.indexOf(text) == i).join("；"); // passing: the same both ways
	}
	const [first, second] = (c.type == "overtake") ? [c.b, c.a] : [c.a, c.b];
	return `${reportElement(c.e)} ${reportTrain(first)}, ${reportTrain(second)} (${reportClock(c.time)})`;
}

/*
	{ conflicts: { overtake, cross, headway: [text] }, diagnoses: [{ conflict, reasons: [text] }], limits: [{ name, value,
	setting, where }], stats, written, unchecked: conflicts left out of the diagnoses }
*/
function passingReport(m, written){
	const conflicts = detectConflicts(m);
	const report = { conflicts: { overtake: [], cross: [], headway: [] }, diagnoses: [], stats: m.stats, written: written,
		limits: passingLimits(m), unchecked: Math.max(conflicts.length - REPORT_DIAGNOSED, 0) };
	// by time, as they are on the diagram
	conflicts.slice().sort((x, y) => x.time - y.time).forEach(c => report.conflicts[c.type].push(describeConflict(m, c)));
	conflicts.slice(0, REPORT_DIAGNOSED).forEach(c => {
		const conflict = `${{ overtake: "追越", cross: "交會", headway: "時隔不足" }[c.type]} ${describeConflict(m, c)}`;
		report.diagnoses.push({ conflict: conflict, reasons: diagnoseConflict(m, { ...c }) });
	});
	return report;
}

// ---- 8. how close the result comes to each limit ----

function passingLimits(m){
	const { minExtraPassingWaiting, maxSearchDepth, interpolationSpeedRatio, interpolationMaxError } = SETTINGS.passingTime;
	const limits = [];
	const wait = shortestWait(m);
	limits.push({ name: "最短待避額外停等時間", setting: `${minExtraPassingWaiting} 秒`,
		value: wait ? `${Math.round(wait.extra)} 秒` : "沒有站內待避", where: wait?.where ?? "" });
	const gap = shortestGap(m);
	limits.push({ name: "最短時隔", setting: `${m.gap} 秒`, value: gap ? `${Math.round(gap.gap)} 秒` : "—",
		where: gap ? `${gap.where}${m.headway ? "" : " (未勾選微調，不檢查)"}` : "" });
	limits.push({ name: "最大搜尋深度", setting: `${maxSearchDepth} 站`, value: `${m.stats.depth} 站`, where: "採用的通過時刻離衝突最遠的距離" });
	const speed = fastestRun(m);
	if(speed) limits.push({ name: "速限", setting: "100%", value: `${(speed.ratio*100).toFixed(1)}%`,
		where: `${speed.where}${speed.timetable ? " (時刻表本身)" : ""}` });
	const junction = junctionError(m);
	if(junction) limits.push({ name: "內插時間距離誤差", setting: (interpolationMaxError === null) ? `速度比 ${interpolationSpeedRatio}` : `${interpolationMaxError} 秒`,
		value: `速度比 ${junction.ratio.toFixed(2)}，與內插值最多差 ${Math.round(junction.error)} 秒`, where: `${junction.ratioAt}；${junction.errorAt}` });
	const dwell = shortestDwell(m);
	if(dwell) limits.push({ name: "最小停車時間", setting: `${m.minDwell} 秒`, value: `${Math.round(dwell.dwell)} 秒`,
		where: `${dwell.where}${dwell.outside ? `；${dwell.outside} 個時刻超出精度範圍` : ""}` });
	const temp = longestTempStop(m);
	if(temp) limits.push({ name: "臨時停車", setting: "", value: `${temp.count} 次，最長 ${Math.round(temp.dwell)} 秒`, where: temp.where });
	return limits;
}

// trains of a bound at its station order k that are there in the middle of their run
function middleTrains(m, bound, k){
	return m.present[stationElement(m, bound, k)][bound].filter(t => k != t.first && k != t.last);
}

// the shortest stop beyond stopsec of a train overtaken while it stops at a station
function shortestWait(m){
	let best = null;
	for(let r = 0; r < m.count; r++){
		[1, 2].forEach(bound => {
			const k = routeIndex(m, bound, r);
			const trains = middleTrains(m, bound, k);
			trains.forEach((y, i) => trains.slice(i + 1).forEach(x => {
				if((x.arr[k] - y.arr[k])*(x.dep[k] - y.dep[k]) >= 0) return;
				const [waits, passes] = (y.arr[k] < x.arr[k]) ? [y, x] : [x, y];
				const extra = waits.dep[k] - waits.arr[k] - m.stopsecs[bound][k];
				if(best && extra >= best.extra) return;
				best = { extra: extra, where: `${reportStation(m, bound, k)}${BOUND_NAMES[bound]} ${reportTrain(waits)}停 ${Math.round(waits.dep[k] - waits.arr[k])} 秒 (${reportClock(waits.arr[k])} ~ ${reportClock(waits.dep[k])})，${reportTrain(passes)}${stopEvent(passes, k, true)}` };
			}));
		});
	}
	return best;
}

// the shortest time between two trains of a bound in a row arriving at (leaving) a station, where the track needs a headway
function shortestGap(m){
	let best = null;
	for(let k = 0; k < m.count; k++){
		[1, 2].forEach(bound => [false, true].forEach(leave => {
			if(leave ? !exitGap(m, bound, k) : !entryGap(m, bound, k)) return;
			const time = t => leave ? t.dep[k] : t.arr[k];
			const trains = m.present[stationElement(m, bound, k)][bound].filter(t => k != (leave ? t.last : t.first)).sort((a, b) => time(a) - time(b));
			trains.slice(1).forEach((v, i) => {
				const gap = time(v) - time(trains[i]);
				if(!best || gap < best.gap) best = { gap: gap, where: reportGap(m, trains[i], v, k, leave) };
			});
		}));
	}
	return best;
}

// the run between two known times in a row nearest the max speeds (minRun() / run time)
function fastestRun(m){
	let best = null;
	m.trains.forEach(t => {
		for(let p = t.first, q = p + 1; q <= t.last; q++){
			if(!t.fixed[q]) continue;
			const ratio = minRun(m, t, p, q)/Math.max(t.arr[q] - t.dep[p], 1);
			if(!best || ratio > best.ratio){
				best = { ratio: ratio, timetable: t.fixed[p] == 1 && t.fixed[q] == 1 && !t.vague[p] && !t.vague[q],
					where: `${reportTrain(t)} ${reportStation(m, t.bound, p)} (${reportClock(t.dep[p])}) → ${reportStation(m, t.bound, q)} (${reportClock(t.arr[q])})，最短 ${Math.round(minRun(m, t, p, q))} 秒` };
			}
			p = q;
		}
	});
	return best;
}

// the junction stops (BranchTrain.js) with the largest ratio of the average speeds around them, and farthest from
// their interpolated times
function junctionError(m){
	let best = null;
	m.trains.forEach(t => t.junctions.forEach(j => {
		const time = t.dep[j.k];
		const v1 = j.d1/(time - j.a);
		const v2 = j.d2/(j.c - time);
		const ratio = (v1 > 0 && v2 > 0) ? Math.max(v1/v2, v2/v1) : Infinity;
		const error = Math.abs(time - j.time);
		const where = `${reportTrain(t)} ${reportStation(m, t.bound, j.k)} ${reportClock(time)} (內插值 ${reportClock(j.time)})`;
		best ??= { ratio: ratio, ratioAt: where, error: error, errorAt: where };
		if(ratio > best.ratio) [best.ratio, best.ratioAt] = [ratio, where];
		if(error > best.error) [best.error, best.errorAt] = [error, where];
	}));
	return best;
}

// the shortest stop at a vague stop of an imprecise timetable, and how many times are outside where they may be
function shortestDwell(m){
	let best = null;
	let outside = 0;
	m.trains.forEach(t => t.vague.forEach((vague, k) => {
		if(!vague) return;
		if(k != t.first && (t.arr[k] < t.early[k] || t.arr[k] > t.arrMax[k])) outside++;
		if(k != t.last && (t.dep[k] < t.depMin[k] || t.dep[k] > t.depMax[k])) outside++;
		if(k == t.first || k == t.last) return;
		const dwell = t.dep[k] - t.arr[k];
		if(!best || dwell < best.dwell) best = { dwell: dwell, where: `${reportTrain(t)} ${reportStation(m, t.bound, k)} ${reportClock(t.arr[k])} ~ ${reportClock(t.dep[k])}` };
	}));
	if(best) best.outside = outside;
	return best;
}

function longestTempStop(m){
	let best = null;
	let count = 0;
	m.trains.forEach(t => t.temp.forEach((temp, k) => {
		if(!temp || t.fixed[k] != 2 || t.arr[k] == t.dep[k]) return;
		count++;
		const dwell = t.dep[k] - t.arr[k];
		if(!best || dwell > best.dwell) best = { dwell: dwell, where: `${reportTrain(t)} ${reportStation(m, t.bound, k)} ${reportClock(t.arr[k])} ~ ${reportClock(t.dep[k])}` };
	}));
	if(best) best.count = count;
	return best;
}

// ---- 9. why a conflict is left ----

function diagnoseConflict(m, c){
	if(!refreshConflict(m, c)) return ["已不存在 (被其他修正連帶解決)"];
	if(c.type == "headway") return diagnoseHeadway(m, c);
	const reasons = [];
	(c.type == "cross" ? [[c.a, c.b], [c.b, c.a]] : [[c.b, c.a]]).forEach(([x, y]) => reasons.push(...diagnoseWait(m, c, x, y)));
	((c.type == "overtake") ? [c.b, c.a] : [c.a, c.b]).forEach(t => {
		const why = rerouteReason(m, c, t);
		if(why) reasons.push(why);
	});
	reasons.push(...triedProposals(m, c));
	return reasons;
}

// t rerouted between its known times around c (rerouteCandidate()), or why it cannot be
function rerouteReason(m, c, t){
	const { candidate, fail } = rerouteCandidate(m, c, t);
	if(fail == -1) return null;
	const head = `整段重排 ${reportTrain(t)} (其他列車不動)：`;
	if(!candidate) return `${head}到 ${reportStation(m, t.bound, fail)} 時已無法同時避開其他列車 (依速限、時隔、不可追越的站間)`;
	const line = candidate.points.filter(point => !point.clear).map(point => `${reportStation(m, t.bound, point.s)} ${reportClock(point.time)}`).join("、");
	const { kept, text } = trialCandidate(m, c, candidate);
	return `${head}${kept ? "可行" : "不採用"}，經 ${line || "原本的直線"}：${text.replace(/^.*?：/, "")}`;
}

// the stations where x could pass while y waits (the window of addCandidates()), each with why it does not work
function diagnoseWait(m, c, x, y){
	const { maxSearchDepth, minExtraPassingWaiting } = SETTINGS.passingTime;
	const station = (c.e % 2 == 0);
	const k = elementOrder(m, x.bound, c.e);
	const end = station ? k : k + 1;
	let p = k;
	while(!x.fixed[p]) p--;
	let q = end;
	while(!x.fixed[q]) q++;
	const name = s => reportStation(m, x.bound, s);
	const reasons = [`${reportTrain(x)}通過、${reportTrain(y)}待避：${reportTrain(x)}在 ${name(p)} 與 ${name(q)} 之間沒有其他時刻，只能在其間 (含 ${name(q)}) 設通過時刻`];
	// nearest first; farther than maxSearchDepth: as if it were deep enough, listed only if y could wait there
	const far = [];
	const orders = [];
	for(let s = p + 1; s <= q; s++) orders.push(s);
	const distanceOf = s => station ? Math.abs(s - k) : (s <= k ? k - s + 1 : s - k);
	orders.sort((a, b) => distanceOf(a) - distanceOf(b)).forEach(s => {
		const distance = distanceOf(s);
		if(distance <= maxSearchDepth){
			const why = waitReason(m, c, x, y, p, q, s, minExtraPassingWaiting);
			if(why) reasons.push(`　${name(s)}：${why.text}`);
			return;
		}
		SETTINGS.passingTime.maxSearchDepth = distance;
		try{
			const why = waitReason(m, c, x, y, p, q, s, minExtraPassingWaiting);
			if(why?.candidate) reasons.push(`　${name(s)} (距離 ${distance} 站，超過最大搜尋深度)：${why.text}`);
			else far.push(name(s));
		}finally{
			SETTINGS.passingTime.maxSearchDepth = maxSearchDepth;
		}
	});
	if(far.length) reasons.push(`　超過最大搜尋深度，且${reportTrain(y)}無法在此待避：${far.join("、")}`);
	[p, q].forEach(j => {
		const why = junctionReason(m, x, y, j, j == q, distanceOf(j));
		if(why) reasons.push(why);
	});
	return reasons;
}

// x's junction stop at its order j moved to y's other side there (junctionMove()), or why it cannot be
function junctionReason(m, x, y, j, after, distance){
	const junction = x.junctions.find(junction => junction.k == j);
	if(!junction) return null;
	const leave = (j == x.first);
	const head = `　分岐站 ${reportStation(m, x.bound, j)} (${reportTrain(x)}${leave ? "進入" : "離開"}本線，內插 ${reportClock(junction.time)}，可在 ${reportClock(junction.min)} ~ ${reportClock(junction.max)})：`;
	const move = junctionMove(m, x, y, j, after);
	const side = `移到${reportTrain(y)}${leave ? "發車" : "到站"}${after ? "後" : "前"}`;
	if(move.fail == "none") return `${head}範圍內沒有「通過時刻的最小單位」的倍數，不移動`;
	if(move.fail == "time") return `${head}${reportTrain(y)}在此沒有時刻，無法比較先後`;
	if(move.fail == "side") return null;
	if(move.fail == "range") return `${head}須${side} (${reportClock(move.at)})，超出可移動範圍；可放寬「內插時間-距離誤差比」或設定「內插最大時間誤差」`;
	const candidates = [];
	addJunctionCandidate(m, x, y, j, after, distance, candidates);
	if(candidates.length == 0) return `${head}${side} (${reportClock(move.at)}) 會超過速限`;
	const { kept, text } = trialCandidate(m, null, candidates[0]);
	return `${head}${kept ? "可行：" : ""}${text}${(distance > SETTINGS.passingTime.maxSearchDepth) ? ` (距離 ${distance} 站，超過最大搜尋深度)` : ""}`;
}

// why x cannot pass its station s while y waits there: { text, candidate: whether it is a candidate (addCandidates()) }, or null
function waitReason(m, c, x, y, p, q, s, minExtraPassingWaiting){
	const no = text => ({ text: text, candidate: false });
	if(s < q && !x.free[s]) return no(`${reportTrain(x)}在此有停靠 (只有到站時刻)`);
	const r = routeIndex(m, x.bound, s);
	const ys = routeIndex(m, y.bound, r);
	if(!passesAt(m, x, y, r, ys)) return no((x.bound == y.bound) ? `軌道配置：${BOUND_NAMES[x.bound]}不可在此追越` : "軌道配置：單線，不可交會");
	if(ys < y.first || ys > y.last) return no(`${reportTrain(y)}不經過此站`);
	const stop = canStop(y, ys);
	if(!(y.wait[ys] || ys == y.first || ys == y.last || stop)){
		if(y.free[ys]) return no(`${reportTrain(y)}在此通過，且沒有臨時停車規則`);
		const dwell = y.vague[ys] ? y.depMax[ys] - y.early[ys] : y.dep[ys] - y.arr[ys];
		return no(`${reportTrain(y)}在此最多停 ${Math.round(dwell)} 秒，不超過 預設停站 ${m.stopsecs[y.bound][ys]} + 最短待避額外停等時間 ${minExtraPassingWaiting} 秒，不視為待避`);
	}
	if(s == q && x.fixed[s] != 1) return null;

	const candidates = [];
	addCandidates(m, c, x, y, candidates);
	const own = candidates.filter(candidate => candidate.s == s && !candidate.points[0].junction);
	if(own.length == 0) return { text: noPlanReason(m, x, s, p, q, y, ys, stop), candidate: true };
	const results = own.map(candidate => trialCandidate(m, c, candidate));
	const ok = results.find(result => result.kept);
	if(ok) return { text: `可行：${ok.text} (求解器停止前未採用)`, candidate: true };
	return { text: results.map(result => result.text).filter((text, i, all) => all.indexOf(text) == i).join("；"), candidate: true };
}

// why there is no passing time for x at s while y waits at ys
function noPlanReason(m, x, s, p, q, y, ys, stop){
	if(s == q) return `${reportTrain(x)}在此停車；${reportTrain(y)}的到站時刻${movesArrival(y, ys) ? `最早 ${reportClock(earliestArrival(m, y, ys))}，無法提早到 ${reportTrain(x)}到站 (${reportClock(x.arr[s])}) 前 ${m.gap} 秒` : "已知，不能提早"}，或 ${reportTrain(x)}未比 ${reportTrain(y)}早 ${m.gap} 秒發車`;
	const from = x.dep[p] + minRun(m, x, p, s);
	const to = x.arr[q] - minRun(m, x, s, q);
	const speed = `${reportTrain(x)}依速限可在 ${reportClock(from)} ~ ${reportClock(to)} 通過`;
	if(from > to) return `${reportTrain(x)}在 ${reportStation(m, x.bound, p)} → ${reportStation(m, x.bound, q)} 已超過速限`;
	if(stop){
		const [yp, yq] = knownAround(y, ys);
		return `${speed}；${reportTrain(y)}依速限可在 ${reportClock(y.dep[yp] + minRun(m, y, yp, ys))} ~ ${reportClock(y.arr[yq] - minRun(m, y, ys, yq))} 臨時停車，加上前後間隔後沒有交集`;
	}
	const low = (ys == y.first) ? null : movesArrival(y, ys) ? earliestArrival(m, y, ys) : y.arr[ys];
	const high = (ys == y.last) ? null : y.dep[ys];
	const wait = `${reportTrain(y)}${(low === null) ? `在此始發 (${reportClock(high)})` : (high === null) ? `在此終到 (${reportClock(low)})` : `停 ${reportClock(low)} ~ ${reportClock(high)}`}`;
	const inside = Math.max(from, (low ?? -Infinity) + m.grid) <= Math.min(to, (high ?? Infinity) - m.gap);
	return inside ? `${speed}，${wait}；但被其他通過列車擋住 (須保持順序並相隔 ${m.gap} 秒)` : `${speed}，${wait}；扣掉時隔 ${m.gap} 秒後沒有交集`;
}

// a trial run of a greedy candidate for conflict c (null: the trains' own conflicts), always undone: { kept, text }
function trialCandidate(m, c, candidate){
	const conflict = c && { ...c };
	const attempt = newAttempt();
	applyCandidate(m, attempt, candidate);
	const what = candidate.points.filter(point => !point.clear).map(point => `${reportTrain(point.t)}${point.arrival ? "到站" : point.departure ? "發車" : point.temp ? "臨時停車" : "通過"} ${point.temp ? `${reportClock(point.arr)} ~ ${reportClock(point.dep)}` : reportClock(point.time)}`).join("、");
	let text;
	let kept = false;
	if(conflict && refreshConflict(m, conflict)){
		text = `${what}：衝突仍在`;
	}else{
		let conflicts = 0, headways = 0;
		const caused = [];
		attempt.pairs.forEach(({ e, a, b, before }) => {
			const now = pairConflict(m, e, a, b);
			if(now == before) return;
			if(now == CONFLICT || before == CONFLICT) conflicts += (now == CONFLICT) - (before == CONFLICT);
			if(now == HEADWAY || before == HEADWAY) headways += (now == HEADWAY) - (before == HEADWAY);
			if(now > before && caused.length < 2) caused.push(`${reportElement(e)} ${reportTrain(a)}/${reportTrain(b)}${(now == CONFLICT) ? (a.bound == b.bound ? "追越" : "交會") : "時隔不足"}`);
		});
		kept = settle(m, attempt, candidate.x, SETTINGS.passingTime.maxPassingPointIncrease);
		const change = [conflicts ? `衝突 ${(conflicts > 0) ? "+" : ""}${conflicts}` : "", headways ? `時隔不足 ${(headways > 0) ? "+" : ""}${headways}` : ""].filter(Boolean).join("、") || "無變化";
		text = `${what}：淨變化 ${change}${caused.length ? ` (新增 ${caused.join("、")})` : ""}${kept ? "" : `，再加 ${SETTINGS.passingTime.maxPassingPointIncrease} 個通過點也無法淨減少`}`;
	}
	undoPassingTimes(m, attempt, 0);
	return { kept: kept, text: text };
}

// the proposals the network solver (PassingTimeSTN.js) made for the trains of c
function triedProposals(m, c){
	const tried = m.stats.proposals.filter(p => (p.x == c.a && p.y == c.b) || (p.x == c.b && p.y == c.a));
	if(tried.length == 0) return [];
	return [`差分約束求解器嘗試過：${tried.map(p => `第 ${p.round} 輪 ${reportTrain(p.x)}${p.passing ? "通過" : "停車"} ${reportStation(m, p.x.bound, p.s)}${p.stop ? ` (${reportTrain(p.y)}臨時停車)` : ""} ${p.kept ? "被接受，但之後又被其他約束推回" : "不可行，撤銷"}`).join("；")}`];
}

// headway c: what each of its trains could do
function diagnoseHeadway(m, c){
	const k = elementOrder(m, c.a.bound, c.e);
	const reasons = [];
	[c.a, c.b].forEach(x => {
		const name = reportTrain(x);
		const pinned = findStop(x.train, k)?.pinned;
		if(pinned){
			reasons.push(`${name}：疊圖的時刻，不移動`);
			return;
		}
		if(!x.vague[k] && !x.free[k]){
			reasons.push(`${name}：在此停靠，時刻表的時刻不移動${x.junctions.some(j => j.k == k) ? " (跨線列車的分岐站)" : ""}`);
			return;
		}
		if(x.vague[k]){
			reasons.push(`${name}：時刻精度不足的停靠站，到站 ${reportClock(x.early[k])} ~ ${reportClock(x.arrMax[k])}、發車 ${reportClock(x.depMin[k])} ~ ${reportClock(x.depMax[k])}`);
		}else{
			const [p, q] = knownAround(x, k);
			reasons.push(`${name}：通過，依速限可在 ${reportClock(x.dep[p] + minRun(m, x, p, k))} ~ ${reportClock(x.arr[q] - minRun(m, x, k, q))} 通過 (前後的時刻 ${reportStation(m, x.bound, p)} ${reportClock(x.dep[p])}、${reportStation(m, x.bound, q)} ${reportClock(x.arr[q])})`);
		}
		const candidates = conflictCandidates(m, c, x);
		if(candidates.length == 0){
			reasons.push(`　找不到與前後列車都相隔 ${m.gap} 秒、又不越過停車列車到發時刻的時刻`);
			return;
		}
		const results = candidates.map(candidate => trialCandidate(m, c, candidate));
		const ok = results.find(result => result.kept);
		reasons.push(`　${ok ? `可行：${ok.text} (求解器停止前未採用)` : results.map(result => result.text).filter((text, i, all) => all.indexOf(text) == i).join("；")}`);
	});
	reasons.push(...triedProposals(m, c));
	return reasons;
}
