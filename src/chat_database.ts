import JSZip, { JSZipObject } from "jszip";
import * as CryptoJS from "crypto-js";
import initSqlJs, { SqlJsStatic, Database } from "sql.js";

export interface ChatDatabase {
	db : AttackDatabase;
	imgBlobMap : { [id : string] : JSZipObject };
	imgThumbMap : { [id : string] : JSZipObject };
}

export interface AttackDatabase {
	iv : number;
	key : Uint8Array;
	db : Database;
}

import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

export function readZip(zip : JSZip, begin_iv : number) : Promise<ChatDatabase> {
	return new Promise((resolve, reject) => {
		///////////////////////////////
		(document.getElementById("dumpTable") as HTMLDivElement).style.display = "hidden";
		
		const chatFolder = zip;
		if (!chatFolder) {
			reject("No chat folder found in the zip file.");
			return;
		}

		interface ChatDB {
			name : string;
			object : JSZipObject;
		}

		const chatDB : ChatDB[] = [];
		const extraMap : { [name : string] : JSZipObject } = {}; // extra file
		const imgBlobMap : { [id : string] : JSZipObject } = {}; // jpeg file
		const imgThumbMap : { [id : string] : JSZipObject } = {}; // thumb (jpg) file

		Object.entries(chatFolder.files).forEach((each : [string, JSZipObject]) => {
			if (each[0].startsWith("linebackup/chat/") && !each[1].dir) {
				if (each[0].endsWith(".extra")) {
					extraMap[each[0].slice(0, -6)] = each[1];
				} else {
					chatDB.push({
						name: each[0],
						object: each[1]
					});
				}
				//console.log("found chatdb : " + each[0]);
			} else if (each[0].startsWith("linebackup/image")) {

				if (each[0].endsWith("thumb")) {
					// set as id
					const id = parseInt(each[0].slice(17, -5));
					imgThumbMap[id] = each[1];
					//console.log("found thumb : " + each[0]);
				} else {
					const id = parseInt(each[0].slice(17, 0));
					imgBlobMap[id] = each[1];
					//console.log("found image : " + each[0]);
				}
			}
		});

		if (chatDB.length == 0) {
			reject("No chat database found in the zip file.");
			return;
		}

		//console.log(chatDB[0])

		const promiseDB = chatDB[0].object.async("arraybuffer");
		const promiseExtra = extraMap[chatDB[0].name].async("arraybuffer");

		Promise.all([promiseDB, promiseExtra]).then((values) => {
			bruteforceDatabase(values[0], values[1], begin_iv).then(database => {
				// show
				(document.getElementById("dumpTable") as HTMLDivElement).style.display = "block";

				(document.getElementById("dumpInfo-IV") as HTMLInputElement).innerHTML = database.iv.toString();
				(document.getElementById("dumpInfo-KeyHex") as HTMLInputElement).innerHTML = (
					Array.from(database.key).map((i) => ('0' + i.toString(16)).slice(-2)).join('')
				)
				///////////////////////////////
				resolve({
					db: database,
					imgBlobMap: imgBlobMap,
					imgThumbMap: imgThumbMap
				});
			})
		});
	});
}

/////////////////////

function bruteforceDatabase(buf : ArrayBuffer, extra : ArrayBuffer, begin_iv : number) : Promise<AttackDatabase> {
	return new Promise((resolve, reject) => {
		const ciphertext = buf.slice(0, 16);
		let iv = begin_iv;

		const sqliteHeader = new Uint8Array([83,
			81,
			76,
			105,
			116,
			101,
			32,
			102,
			111,
			114,
			109,
			97,
			116,
			32,
			51,
			0
		]);

		const key = new Uint8Array(16);
		
		let failed = false;
		for (; iv <= 2147483647; iv++) {
			const pad = new Int8Array(16);
			failed = false;
			
			pad[0] = iv;
			pad[1] = pad[0] - 71;
			pad[2] = pad[1] - 71;
			
			for (let i = 3; i < 16; i++) {
				pad[i] = pad[i - 3] ^ pad[i - 2] ^ 0xb9 ^ i;
			}
			
			let factor = iv;
			if (iv > -2 && iv < 2) {
				factor = -313187 + 13819823 * iv;
			}
			
			let term = -7;
			for (let i = 1; i <= 16; i++) {
				const index = i & 15;
				let value = pad[index] * factor + term;

				term = Number((BigInt(value) >> 32n) & 255n);
				value = (value >> 32) + term;

				if (value < term) {
					term++;
					value++;
				}

				value = -value - 2;
				key[index] = value;
			}

			//console.log(key)
			
			const plaintxt = CryptoJS.AES.decrypt(
				// @ts-ignore
				{ ciphertext: CryptoJS.lib.WordArray.create(ciphertext) },
				CryptoJS.lib.WordArray.create(key),
				{
					mode: CryptoJS.mode.ECB
				}
			);

			if (plaintxt.sigBytes != 16)
				continue;

			const words = plaintxt.words;
			const result = new Uint8Array(16);
			let j = 0;

			for (let i = 0; i < 4;) {
				var w = words[j++];
				result[i] = (w & 0xff000000) >>> 24;
				if (result[i] != sqliteHeader[i++]) {
					failed = true;
					break;
				}
				result[i] = (w & 0x00ff0000) >>> 16;
				if (result[i] != sqliteHeader[i++]) {
					failed = true;
					break;
				}
				result[i] = (w & 0x0000ff00) >>> 8;
				if (result[i] != sqliteHeader[i++]) {
					failed = true;
					break;
				}
				result[i] = (w & 0x000000ff);
				if (result[i] != sqliteHeader[i++]) {
					failed = true;
					break;
				}
			}
			if (failed)
				continue;
			
			failed = true; // lie
			break;
		}
		if (!failed) {
			reject("Failed to find the key (impossible ?)");
			return;
		}

		console.log("iv: " + iv);

		// decrypt full db

		const decoder = new TextDecoder();
		const str = decoder.decode(extra);
		let i = 0;

		const dbbufword = CryptoJS.AES.decrypt(
			// @ts-ignore
			{ ciphertext: CryptoJS.lib.WordArray.create(buf) },
			CryptoJS.lib.WordArray.create(key),
			{
				mode: CryptoJS.mode.ECB
			}
		);

		let word;

		let dbbuff = new Uint8Array(dbbufword.sigBytes);

		for (let j = 0; j < dbbufword.sigBytes; j++) {
			word = dbbufword.words[j];
			dbbuff[i++] = word >> 24;
			dbbuff[i++] = (word >> 16) & 0xff;
			dbbuff[i++] = (word >> 8) & 0xff;
			dbbuff[i++] = word & 0xff;
		}

		let dbbuf = new Uint8Array(0);

		let prevChunkSize = 0;
		str.split(",").forEach((each : string) => {
			const chunkSize = parseInt(each);

			const removedPadding = chunkSize - dbbuff[chunkSize - 1];

			const chunk = dbbuff.slice(prevChunkSize, removedPadding + prevChunkSize);
			const buf = new Uint8Array(dbbuf.length + chunk.length);
			buf.set(dbbuf);
			buf.set(chunk, dbbuf.length);
			dbbuf = buf;
			prevChunkSize += chunkSize;
		});

		/*
		const a = document.createElement('a')
		a.href = URL.createObjectURL(new Blob(
			[ dbbuf ],
		))
		a.download = "lmao.db"
		a.click()
		*/

		// read sqlite
		initSqlJs({ locateFile : () => wasmUrl }).then((SQL : SqlJsStatic) => {
			const db = new SQL.Database(dbbuf);
			resolve({
				iv: iv,
				key: key,
				db : db
			});
		}).catch(reject);
	});
}