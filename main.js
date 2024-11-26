'use strict';

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
// const fs = require("fs");
// @ts-ignore
const { SerialPort } = require('serialport');
// @ts-ignore
const { ByteLengthParser } = require('@serialport/parser-byte-length');

const EltakoTools = require('./lib/eltako-tools');
const DeviceList = require('./lib/devicelist.json');

// List IDs
let EltakoData = null;

// Eltako Communication class
class Eltako extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'eltako',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		// Reset the connection indicator during startup
		await this.setStateAsync('info.connection', false, true);

		// new Eltako Data
		EltakoData = new Map();

		// create eltako devices
		this.createDeviceList();


		// try to initialize communication
		if (this.config.usbport) {

			// create serial port
			this.commPort = new SerialPort({path: this.config.usbport, baudRate: this.config.baudrate });

			// A transform stream that emits data as a buffer after a specific number of bytes are received.
			this.commParser = this.commPort.pipe(new ByteLengthParser({ length: 14 }));

			// initialize communication
			if (this.commPort != null) {
				await this.communication();
			}
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// stop communication
			if (this.commPort != null) {
				this.commPort.close();
			}

			// update connection state.
			this.setState('info.connection', false, true);

			// and finish...
			callback();

		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	async onStateChange(id, state) {

		const obj = await this.getObjectAsync(id);

		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);

			if (state) {

				// state.from
				// example: system.adapter.eltako.0.
				const adaptTmp = state.from.split('.');
				const adaptFrom = adaptTmp.slice(0,3).join('.');

				if (adaptFrom !== 'system.adapter.eltako') {

					// The state was changed
					this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack}) from: ${state.from}`);

					// state eltako.0.lights.floor3.state changed: true (ack = false) from: system.adapter.admin.0
					// state eltako.0.lights.floor2.state changed: true (ack = false) from: system.adapter.socketio.0
					// state eltako.0.lights.floor3.state changed: false (ack = true) from: system.adapter.eltako.0

					const idTmp = id.split('.');
					//const idFrom = idTmp.slice(0,-1).join('.');
					const idType = (idTmp.slice(idTmp.length - 1, idTmp.length)).toString();

					if (obj)  {
						switch (obj.native.Type) {
							case 'FSR14':	// Light, Sockets
								if (idType == 'state') {
									// Light on 0x09, off 0x08
									this.sendEltakoTlg(obj.native.Id, 0x07, 1, 0, 0, ((state.val == 1) ? 0x09 : 0x08));
								}
								break;
						}
					}
				}
			}
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	/**
	 *   serial communiation eltako
	 */
	async communication() {

		// port opened
		this.commPort.on('open', () => {

			// update connection state.
			this.setState('info.connection', true, true);

			// setup parser
			this.commParser.on('data' , (data) => {
				this.parseEltakoTlg(data);
			});

			// Logfile
			this.log.info('Eltako usb/serial port ' + this.config.usbport + ' with baudrate ' + this.config.baudrate + ' opened.');
		});

		// port closed
		this.commPort.on('close', () => {
			// update connection state.
			this.setState('info.connection', false, true);

			// Logfile
			this.log.info('Eltako usb/serial port ' + this.config.usbport + ' closed.');
		});

		// port error
		this.commPort.on('error', (error) => {
			// Logfile
			this.log.info('Eltako usb/serial port ' + this.config.usbport + ' error: ' + error);
		});
	}

	/*
	* Send eltako telegram
	*/
	async sendEltakoTlg(id, org, data3, data2, data1, data0) {

		try {
			const tlg = [];

			tlg[0]  = 0xA5;
			tlg[1]  = 0x5A;
			tlg[2]  = 0x0B;

			tlg[3]  = org;

			tlg[4]  = data3;
			tlg[5]  = data2;
			tlg[6]  = data1;
			tlg[7]  = data0;

			const arrID = EltakoTools.senderIDtoBytes(id);

			tlg[8]  = arrID.ID3;
			tlg[9]  = arrID.ID2;
			tlg[10] = arrID.ID1;
			tlg[11] = arrID.ID0;

			tlg[12] = 0;		// State 0

			tlg[13] = EltakoTools.calcTelegramCRC(tlg);

			// send Eltako telegram
			this.commPort.write(tlg, (err) => {
				if (err) {
					this.log.warn('Eltako telegram error sending data: ' + err);
					return;
				}
			});

			// Logfile
			this.log.info('Eltako telegram sent: ' + EltakoTools.telegramToString(tlg));

		} catch (e) {
			// Logfile
			this.log.error('Eltako telegram sent error: ' + e);
		}
	}

	/**
	 *   parse eltako telegram
	 */
	async parseEltakoTlg(data) {
		/*
			Eltako TLG Data - A5 5A 0B 05 50 00 00 00 00 15 B7 FE 30 5A

			STRUCT
				Sync0	: BYTE; - 0
				Sync1	: BYTE;	- 1
				HSeq	: BYTE; - 2
				ORG		: BYTE; - 3
				Data3	: BYTE; - 4
				Data2	: BYTE; - 5
				Data1	: BYTE; - 6
				Data0	: BYTE; - 7
				ID3		: BYTE; - 8
				ID2		: BYTE; - 9
				ID1		: BYTE; - 10
				ID0		: BYTE; - 11
				State	: BYTE; - 12
				CRC		: BYTE; - 13
			END_STRUCT
		*/

		// Logfile
		this.log.info('Eltako telegram receive: ' + EltakoTools.telegramToString(data));

		// update info.lastmsg
		this.setState('info.lastmsg', EltakoTools.telegramToString(data), true);

		// Eltako Telegramm
		const tlg = EltakoTools.telegram(data);

		// check CRC sum
		if (EltakoTools.calcTelegramCRC(data) == tlg.CRC)  {

			// CRC pass -> sender ID
			const senderID = EltakoTools.senderID(data);
			if (EltakoData.has(senderID) === true) {

				const obj = await this.getObjectAsync(EltakoData.get(senderID));
				if (obj != null)
				{
					this.log.info('Eltako Id:' +  senderID + ' iobroker: ' + obj._id);

					if (obj.native.Type === 'FSR14') {
						if (tlg.Data3 == 0x50) {
							this.setState(obj._id + '.state', 0, true);
						}
						if (tlg.Data3 == 0x70) {
							this.setState(obj._id + '.state', 1, true);
						}
					}
				} else {
					this.log.warn('Unknown ioBroker object - Eltako ID ' + senderID);
				}
			} else {
				this.log.warn('Eltako unknown ID ' + senderID);
			}

		} else {
			// Logfile
			this.log.warn('Eltako telegram CRC error');
		}
	}

	/*
	* Create Eltako Devicelist
	*/
	async createDeviceList() {

		// Path
		let path = '';

		// Create tree structure

		// Lights
		path = 'lights';
		await this.setObjectNotExistsAsync(path, {
			type: 'device',
			common: {
				name: 'Lights'
			},
			native: {}
		});

		for (const i in DeviceList.Lights) {

			const subpath = path + '.' + DeviceList.Lights[i].Name;
			this.setObjectNotExistsAsync(subpath, {
				type: 'channel',
				common: {
					name: DeviceList.Lights[i].Desc
				},
				native: {
					'Type': DeviceList.Lights[i].Type,
					'Adr': DeviceList.Lights[i].Adr,
					'Id': DeviceList.Lights[i].Id
				}
			});

			this.setObjectNotExistsAsync(subpath + '.state', {
				type: 'state',
				common: {
					name: 'light state',
					type: 'number',
					role: 'value',
					read:  true,
					write: true,
					def: DeviceList.Lights[i].Values.State
				},
				native: {
					'Type': DeviceList.Lights[i].Type,
					'Adr': DeviceList.Lights[i].Adr,
					'Id': DeviceList.Lights[i].Id
				}

			});
			// subscribe
			this.subscribeStates(subpath + '.state');


			this.setObjectNotExistsAsync(subpath + '.uzsu', {
				type: 'state',
				common: {
					name: 'light timer',
					type: 'string',
					role: 'json',
					read:  true,
					write: true
				},
				native: {
					'Type': DeviceList.Lights[i].Type,
					'Adr': DeviceList.Lights[i].Adr,
					'Id': DeviceList.Lights[i].Id
				}

			});
			// subscribe
			this.subscribeStates(subpath + '.uzsu');

			// remember
			EltakoData.set(DeviceList.Lights[i].Adr, subpath);
		}

		// Sockets
		path = 'sockets';
		this.setObjectNotExistsAsync(path, {
			type: 'device',
			common: {
				name: 'sockets'
			},
			native: {}
		});

		for (const i in DeviceList.Sockets) {

			const subpath = path + '.' + DeviceList.Sockets[i].Name;
			this.setObjectNotExistsAsync(subpath, {
				type: 'channel',
				common: {
					name: DeviceList.Sockets[i].Desc
				},
				native: {
					'Type': DeviceList.Sockets[i].Type,
					'Adr': DeviceList.Sockets[i].Adr,
					'Id': DeviceList.Sockets[i].Id
				}
			});

			this.setObjectNotExistsAsync(subpath + '.state', {
				type: 'state',
				common: {
					name: 'socket state',
					type: 'number',
					role: 'value',
					read:  true,
					write: true,
					def: DeviceList.Sockets[i].Values.State,
				},
				native: {
					'Type': DeviceList.Sockets[i].Type,
					'Adr': DeviceList.Sockets[i].Adr,
					'Id': DeviceList.Sockets[i].Id
				}
			});
			// subscribe
			this.subscribeStates(subpath + '.state');

			this.setObjectNotExistsAsync(subpath + '.uzsu', {
				type: 'state',
				common: {
					name: 'socket timer',
					type: 'string',
					role: 'json',
					read:  true,
					write: true
				},
				native: {
					'Type': DeviceList.Sockets[i].Type,
					'Adr': DeviceList.Sockets[i].Adr,
					'Id': DeviceList.Sockets[i].Id
				}
			});

			// subscribe
			this.subscribeStates(subpath + '.uzsu');

			// remember
			EltakoData.set(DeviceList.Sockets[i].Adr, subpath);
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Eltako(options);
} else {
	// otherwise start the instance directly
	new Eltako();
}