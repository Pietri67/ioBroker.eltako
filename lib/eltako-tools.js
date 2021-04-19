
'use strict';

/**
 * Eltako Telegramm
 * @param {any[]} data
 */
function Telegram(data) {

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
function TelegramToString(data) {
	return data[0] + ',' + data[1] + ',' + data[2] + ',' + data[3]
	+ ',' + data[4] + ',' + data[5] + ',' + data[6] + ',' + data[7] + ',' + data[8]
	+ ',' + data[9] + ',' + data[10] + ',' + data[11] + ',' + data[12] + ',' + data[13];
}

/**
 * Check Telegram CRC
 * @param {any} data
 */
function CheckTelegramCRC(data) {

	let i;
	let CRC = 0;
	for (i = 2; i < 13; i++) {
		CRC += Number(data[i]);
	}
	CRC = CRC % 256;

	if (CRC == data[13]) return true;
	else return false;
}

/**
 * SenderID vom Telegramm
 * @param {any} data
 */
function SenderID(data) {
	return Number(data[11]) + (Number(data[10]) * 256) + (Number(data[9]) * 65535) + (Number(data[8]) * 16777216);
}

module.exports = {
	Telegram,
	TelegramToString,
	CheckTelegramCRC,
	SenderID
};