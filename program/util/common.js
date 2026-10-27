function escapeHTML(str){
	return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function downloadFile(fileName, text){
	const blob = new Blob([text], { type: "application/octet-stream" });
	const link = document.createElement("a");
	link.href = URL.createObjectURL(blob);
	link.download = fileName;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	setTimeout(() => URL.revokeObjectURL(link.href));
}

// calls onLoad(text, "csv" | "json"); returns false if no file is selected
function readImportFile(fileInput, onLoad){
	const [file] = $(fileInput)[0].files;
	if(!file) return false;

	const type = file.name.toLowerCase().endsWith(".json") ? "json" : "csv";
	const reader = new FileReader();
	reader.addEventListener("load", () => onLoad(reader.result.replace(/^﻿/, ""), type));
	reader.readAsText(file);
	return true;
}

// split into rows of cells, dropping trailing empty lines
function parseCSV(text){
	const lines = text.split(/\r?\n/);
	while(lines.length > 0 && lines[lines.length - 1] == "") lines.pop();
	return lines.map(line => line.split(","));
}
