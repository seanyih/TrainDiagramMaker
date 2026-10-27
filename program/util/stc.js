/*string-time conversion*/

function stringzero(str){
	switch (str.length){
		case 1:
			str = "00000"+str;
			break;
		case 2:
			str = "0000"+str;
			break;
		case 3:
			str = "000"+str;
			break;
		case 4:
			str = "00"+str;
			break;
		case 5:
			str = "0"+str;
			break;
	}
	return str;
}

function deductSec(str,sec){
	/*
	str = hhmmss
	*/
	let h = Math.floor(str/10000);
	let m = Math.floor((str%10000)/100);
	let s = str%100;

	while(s<sec){
		if(m == 0){
			if(h == 0) h+=24;
			h--;
			m+=60;
		}
		m--;
		s+=60;
	}
	s=s-sec;
	h = h.toString();
	if(h.length == 1) h=+"0"+h;
	m = m.toString();
	if(m.length == 1) m=+"0"+m;
	s = s.toString();
	if(s.length == 1) s=+"0"+s;
	if(s!="00") return h+m+s;
	else return h+m;
}

function toSec(str){
	if(str.length == 4){//hhmm
		return Math.floor(str/100)*3600+(str%100)*60;
	}else if(str.length == 6){
		return Math.floor(str/10000)*3600+(Math.floor(str/100)%100)*60+(str%100);
	}
}

function toStr(time){
	time = Math.round(time);
	let h = Math.floor(time/3600);
	let m = Math.floor((time%3600)/60);
	let s = time%60;

	h = h.toString();
	if(h.length == 1) h=+"0"+h;
	m = m.toString();
	if(m.length == 1) m=+"0"+m;
	s = s.toString();
	if(s.length == 1) s=+"0"+s;
	if(s!="00") return h+m+s;
	else return h+m;
}

function tohhmmss(str){
	if(str == ""){
		return "";
	}else{
		switch (str.length){
			case 3:
				str = "0" + str + "00";
				break;
			case 4:
				str = str + "00";
				break;
			case 5:
				str = "0" + str;
				break;
		}
		return str;
	}
}
// "935" -> "0935", "93500" -> "093500"; returns null if not a valid (h)hmm or (h)hmmss time
function normalizeTime(str){
	str = str.trim();
	if(str == "") return "";
	if(!/^\d{1,6}$/.test(str)) return null;

	str = str.padStart(str.length <= 4 ? 4 : 6, "0");
	const h = parseInt(str.slice(0, 2));
	const m = parseInt(str.slice(2, 4));
	const s = (str.length == 6) ? parseInt(str.slice(4, 6)) : 0;
	if(m >= 60 || s >= 60 || h*3600 + m*60 + s > 86400) return null;
	return str;
}
