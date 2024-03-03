import JSZip, { JSZipObject } from "jszip";
import { readZip, ChatDatabase } from "./chat_database";

function error(txt : string) : void {
	const noteMsg = document.getElementById("noteMsg") as HTMLDivElement;
	noteMsg.innerHTML = txt.toString();
	noteMsg.style.display = "block";
	noteMsg.classList.add("alert-danger");
	noteMsg.classList.remove("alert-success");
	console.error(txt);
}

function clearError() {
	const noteMsg = document.getElementById("noteMsg") as HTMLDivElement;
	noteMsg.classList.remove("alert-danger");
	noteMsg.classList.add("alert-success");
	noteMsg.style.display = "none";
}

function success(txt : string) {
	const noteMsg = document.getElementById("noteMsg") as HTMLDivElement;
	noteMsg.innerHTML = txt.toString();
	noteMsg.style.display = "block";
	noteMsg.classList.remove("alert-danger");
	noteMsg.classList.add("alert-success");
	console.log(txt);
}

function dump() {
	const zipFile = document.getElementById("zipFile") as HTMLInputElement;
	const files = zipFile.files;
	if (!files || files.length != 1) {
		error("You must select a single file");
		return;
	}
	clearError();
	////////////////////////////////////////
	const file = files[0];
	console.log(">> " + file);

	const startDate = Date.now();

	dumpButton.disabled = true;
	dumpButton.innerHTML = "<span class=\"spinner-border spinner-border-sm\" aria-hidden=\"true\"></span>&nbsp;<span role=\"status\">Finding a key . . . (may freeze the page and and take more than an hour or a day !)</span>";

	const recoveredIV = document.getElementById("recoveredIV") as HTMLInputElement;
	let start_iv = -2147483648;
	if (recoveredIV.value != "") {
		start_iv = parseInt(recoveredIV.value);
	}

	file.arrayBuffer().then(buf => {
		const zip = new JSZip();
		zip.loadAsync(buf).then((zip) => {
			readZip(zip, start_iv).then((database : ChatDatabase) => {
				const secs = (Date.now() - startDate) / 1000

				const hours = Math.floor(secs / 3600)
				const minutes = Math.floor((secs % 3600) / 60)
				const seconds = Math.floor((secs % 3600) % 60)
				success("Found the key. Took " + hours + "h " + minutes + "m " + seconds + "s");

				currentDatabase = database;
				showDatabase();
				end();
			}).catch((err) => {
				error(err);
				end();
			});
		}).catch((err) => {
			error(err);
			end();
		});
	});
}

function end() {
	dumpButton.disabled = false;
	dumpButton.innerHTML = "Dump";
}

/////////////////////////

const dumpButton = document.getElementById("dumpButton") as HTMLButtonElement;
dumpButton.addEventListener("click", dump);

const navList = document.getElementById("navList") as HTMLDivElement;

const anchor = document.createElement("a");
anchor.href = "#";
anchor.id = "dumpInfo-Item";
anchor.classList.add("list-group-item");
anchor.classList.add("list-group-item-action");
anchor.innerHTML = "Dump Info";
anchor.addEventListener("click", showInfo);

navList.appendChild(anchor);

const chatLoadMore = document.getElementById("chatLoadMore") as HTMLButtonElement;
chatLoadMore.addEventListener("click", (e : Event) => {
	e.preventDefault();
	if (!currentDatabase) {
		return;
	}

	feedChat();
});

/////////////////////////
import { SqlValue } from "sql.js";

let currentDatabase : ChatDatabase | null = null;

let offset = 0;
let from : number = 0;
let currDay = 0;
let currMonth = 0;
let currYear = 0;

const chatList : string[] = [];
let currentChat : string | null = null;

const stickerID = /stickerId\s([0-9]+)/;

import avatarPng from "/avatar.png";

function showDatabase() {
	const navList = document.getElementById("navList") as HTMLDivElement;
	if (!currentDatabase) {
		return;
	}

	// clear
	chatList.forEach((each : string) => {
		const anchor = document.getElementById("chatInfo-Item-" + each) as HTMLAnchorElement;
		navList.removeChild(anchor);
	});

	const res = currentDatabase.db.db.exec("SELECT chat_id, COUNT(chat_id) FROM chat_history");
	

	res[0].values.forEach((each : SqlValue[]) => {
		chatList.push(each[0] as string);

		const anchor = document.createElement("a");
		anchor.href = "#";
		anchor.id = "chatInfo-Item-" + each[0] as string;
		anchor.classList.add("list-group-item");
		anchor.classList.add("list-group-item-action");
		anchor.innerHTML = each[0] as string;
		anchor.addEventListener("click", (e : Event) => {
			e.preventDefault();
			showChat(each[0] as string);
		});
		navList.appendChild(anchor);
	});

	showInfo(new Event("click"));
}

function showInfo(e : Event) {
	e.preventDefault();

	unactive();

	const dumpInfo = document.getElementById("dumpInfo") as HTMLDivElement;
	const dumpInfoItem = document.getElementById("dumpInfo-Item") as HTMLAnchorElement;
	dumpInfoItem.classList.add("active");
	dumpInfo.style.display = "block";

	const chatDiv = document.getElementById("chatDiv") as HTMLDivElement;
	chatDiv.style.display = "none";

	currentChat = null;
}

function unactive() {
	// remove active
	if (currentChat) {
		const chatInfoItem = document.getElementById("chatInfo-Item-" + currentChat) as HTMLAnchorElement;
		chatInfoItem.classList.remove("active");
	} else {
		const dumpInfoItem = document.getElementById("dumpInfo-Item") as HTMLAnchorElement;
		dumpInfoItem.classList.remove("active");
		const dumpInfo = document.getElementById("dumpInfo") as HTMLDivElement;
		dumpInfo.style.display = "none";
	}
}

function showChat(chatID : string) {
	if (!currentDatabase) {
		return;
	}
	
	unactive();

	// add active
	const chatInfoItem = document.getElementById("chatInfo-Item-" + chatID) as HTMLAnchorElement;
	chatInfoItem.classList.add("active");

	const chatDiv = document.getElementById("chatDiv") as HTMLDivElement;
	chatDiv.style.display = "block";

	const chatCol = document.getElementById("chatCol") as HTMLDivElement;
	chatCol.innerHTML = "";

	currentChat = chatID;
	offset = 0;
	from = 0;
	currDay = 0;
	currMonth = 0;
	currYear = 0;
	chatLoadMore.style.display = "block";

	feedChat();
}

function feedChat() {
	if (!currentDatabase) {
		return;
	}

	const chatCol = document.getElementById("chatCol") as HTMLDivElement;
	/////////////////////////////

	let limit = 100;

	const res = currentDatabase.db.db.exec("SELECT id, chat_id, from_mid, content, created_time, read_count, attachement_image, attachement_image_height, attachement_image_width, attachement_type, attachement_local_uri, parameter FROM chat_history LIMIT " + limit + " OFFSET " + offset);
	
	let prevMetaText : HTMLSpanElement | null = null;

	for (let i = 0; i < res[0].values.length; i++) {
		const each = res[0].values[i];

		if (each[1] as string !== currentChat)
			continue;

		//console.log(each);
		const content : SqlValue = each[3];

		if (content != null) {
			if (content == "")
				continue;
		}

		const from_mid : SqlValue = each[2];

		let cont = false;
		if (from_mid == null) {
			// from me
			if (from == 1) {
				cont = true;
			} else {
				from = 1;
			}
		} else {
			// from them
			if (from == 2) {
				cont = true;
			} else {
				from = 2;
			}
		}

		const rowFrom = document.createElement("div");
		const from_me = from_mid == null;

		rowFrom.classList.add(from_me ? "row-from-me" : "row-from-them");

		const created_time : SqlValue = each[4];

		var date = new Date(parseInt(created_time as string));
		if (
			currDay != date.getDate() ||
			currMonth != date.getMonth() ||
			currYear != date.getFullYear()
		) {
			currDay = date.getDate();
			currMonth = date.getMonth();
			currYear = date.getFullYear();

			const div = document.createElement("div");
			const divDate = document.createElement("div");
			divDate.classList.add("message-date");
			divDate.innerHTML = date.toDateString();
			div.appendChild(divDate);
			chatCol.appendChild(div);
			cont = false;
		}

		let messageContent : HTMLDivElement | null = null;
		if (content != null) {
			messageContent = document.createElement("div");
			messageContent.classList.add("message-balloon");
			messageContent.classList.add(from_me ? "from-me" : "from-them");
			if (!cont)
				messageContent.classList.add(from_me ? "from-me-tail" : "from-them-tail");
			messageContent.innerHTML = content as string;
		} else {
			const attachement_type = each[9] as number;
			if (attachement_type == 1) {
				const blob : JSZipObject = currentDatabase.imgThumbMap[each[0] as string];
				if (blob) {
					const div = document.createElement("div");
					const img = document.createElement("img");
					blob.async("base64").then((base64 : string) => {
						img.src = "data:image/jpeg;base64," + base64;
					});
					div.classList.add("message-image");
					div.appendChild(img);
					messageContent = div;
				} else {
					continue;
				}
			} else if (attachement_type == 7) {
				// sticker
				const div = document.createElement("div");
				const img = document.createElement("img");

				const res = stickerID.exec(each[11] as string);

				if (!res) {
					continue;
				}

				img.src = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${res[1]}/android/sticker.png`;
				div.appendChild(img);
				messageContent = div;
			} else {
				continue;
			}
		}

		const metaText = document.createElement("span");
		metaText.classList.add("meta-text");
		// set the time without seconds
		metaText.innerHTML = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

		if (from_me) {
			rowFrom.appendChild(metaText);
			rowFrom.appendChild(messageContent);
		} else {
			if (!cont) {
				// avatar
				const avatar = document.createElement("div");
				avatar.classList.add("avatar");
				const img = document.createElement("img");
				img.src = avatarPng;
				avatar.appendChild(img);
				rowFrom.appendChild(avatar);
			} else {
				messageContent.classList.add("avatar-gap");
			}
			rowFrom.appendChild(messageContent);
			rowFrom.appendChild(metaText);
		}

		chatCol.appendChild(rowFrom);

		if (cont) {
			if (prevMetaText) {
				prevMetaText.remove();
			}
		}

		prevMetaText = metaText;
	}

	offset += limit;

	const res2 = currentDatabase.db.db.exec("SELECT id FROM chat_history LIMIT " + limit + " OFFSET " + offset);
	if (res2.length == 0) {
		chatLoadMore.style.display = "none";
	}
}