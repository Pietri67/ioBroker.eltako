// @ts-nocheck

'use strict';

/**
 * Eltako Telegramm
 * @param {any[]} data
 */
function telegram(data) {

	const tlg = {
		Sync0:  data[0],
		Sync1:  data[1],
		HSeq:   data[2],
		ORG: 	data[3],
		Data3:  data[4],
		Data2: 	data[5],
		Data1: 	data[6],
		Data0: 	data[7],
		ID3: 	data[8],
		ID2: 	data[9],
		ID1: 	data[10],
		ID0: 	data[11],
		State: 	data[12],
		CRC: 	data[13]
	};

	return tlg;
}

/**
 * Telegramm to String
 * @param {string[]} data
 */
function telegramToString(data) {
	return data[0] + ',' + data[1] + ',' + data[2] + ',' + data[3]
	+ ',' + data[4] + ',' + data[5] + ',' + data[6] + ',' + data[7] + ',' + data[8]
	+ ',' + data[9] + ',' + data[10] + ',' + data[11] + ',' + data[12] + ',' + data[13];
}

/**
 * Calc Telegram CRC
 * @param {any} data
 */
function calcTelegramCRC(data) {

	let i;
	let CRC = 0;
	for (i = 2; i < 13; i++) {
		CRC += Number(data[i]);
	}
	CRC = CRC % 256;

	return CRC;
}

/**
 * SenderID vom Telegramm
 * @param {any} data
 */
function senderID(data) {
	return Number(data[11]) + (Number(data[10]) * 256) + (Number(data[9]) * 65535) + (Number(data[8]) * 16777216);
}


/**
 * SenderID to byte array
 * @param {number} num
 */
function senderIDtoBytes (num) {
	const arr = {
		ID0: (num & 0xff) >> 0,
		ID1: (num >> 8) & 0xff,
		ID2: (num >> 16) & 0xff,
		ID3: (num >> 24) & 0xff
	};
	return arr;
}


/**
 * Parse Time
 * @param {string} t
 */
function parseTime( t ) {
	const d = new Date();
	const time = t.match( /(\d+)(?::(\d\d))?\s*(p?)/ );
	d.setHours( parseInt( time[1]) + (time[3] ? 12 : 0) );
	d.setMinutes( parseInt( time[2]) || 0 );
	d.setSeconds(0);
	return d;
}


module.exports = {
	telegram,
	telegramToString,
	calcTelegramCRC,
	senderID,
	senderIDtoBytes,
	parseTime
};