// @ts-nocheck
'use strict';

/*
 * Created with @iobroker/create-adapter v1.33.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const SerialPort = require('serialport');
const ByteLength = require('@serialport/parser-byte-length');
const EltakoTools = require('./lib/eltako-tools');
const DeviceList = require('./lib/devicelist.json');

// Communication Port/Parser
let commPort = null;
let commParser = null;

// Eltako Data
let EltakoData = null;



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
		this.on('unload', this.onUnload.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {

		// Reset the connection indicator during startup
		await this.setStateAsync('info.connection', false, true);

		// try to initialize communication
		if (this.config.usbport) {

			// create serial port
			commPort = new SerialPort(this.config.usbport, {
				baudRate: 57600
			});

			// create parser 14Byte
			commParser = commPort.pipe(new ByteLength({length: 14}));

			// initialize communication
			await this.communication();
		}

		// new Eltako Data
		EltakoData = new Map();

		// create eltako devices
		this.createDeviceList();
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// stop communication
			if (commPort != null) {
				commPort.close();
			}

			// update connection state.
			this.setState('info.connection', false, true);

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
				const idFrom = idTmp.slice(0,-1).join('.');
				const idType = idTmp.slice(idTmp.length - 1, idTmp.length);

				const obj = await this.getObjectAsync(id);
				if (obj)  {

					switch (obj.native.Type) {
						case 'FSR14':	// Light, Sockets
							// Light on 0x09, off 0x08
							this.sendEltakoTlg(obj.native.Id, 0x07, 1, 0, 0, ((state.val == 1) ? 0x09 : 0x08));
							break;

						case 'FSG14':
						case 'FUD14':	// Dimmmer
							if (idType == 'state') {
								const speed = await this.getStateAsync(idFrom + '.speed');
								const brightness = await this.getStateAsync(idFrom + '.brightness');
								this.sendEltakoTlg(obj.native.Id, 0x07, 2, brightness.val, speed.val, ((state.val == 1) ? 0x09 : 0x08));
							}
							if (idType == 'brightness') {
								const speed = await this.getStateAsync(idFrom + '.speed');
								const mode = await this.getStateAsync(idFrom + '.state');
								this.sendEltakoTlg(obj.native.Id, 0x07, 2, state.val, speed.val, ((mode.val == 1) ? 0x09 : 0x08));
							}
							break;
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
		commPort.on('open', () => {

			// setup parser
			commParser.on('data' , (data) => {
				this.parseEltakoTlg(data);
			});

			// update connection state.
			this.setState('info.connection', true, true);

			// Logfile
			this.log.info('Eltako usb/serial port ' + this.config.usbport + ' with baudrate ' + this.config.baudrate + ' opened.');
		});

		// port closed
		commPort.on('close', () => {
			// update connection state.
			this.setState('info.connection', false, true);

			// Logfile
			this.log.info('Eltako usb/serial port ' + this.config.usbport + ' closed.');
		});

		// port error
		commPort.on('error', (error) => {
			// Logfile
			this.log.info('Eltako usb/serial port ' + this.config.usbport + ' error: ' + error);
		});
	}

	/**
	 *   parse eltako telegram
	 */
	async parseEltakoTlg(data) {
	/*
		Eltako TLG Data /* A5 5A 0B 05 50 00 00 00 00 15 B7 FE 30 5A

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
		this.log.info('Eltako telegram: ' + EltakoTools.telegramToString(data));

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
				if (obj.native.Type === 'FSR14') {
					if (tlg.Data3 == 0x50) {
						this.setState(obj._id + '.state', 0, true);
					}
					if (tlg.Data3 == 0x70) {
						this.setState(obj._id + '.state', 1, true);
					}
				}

				if ((obj.native.Type === 'FUD14') || (obj.native.Type === 'FSG14'))  {
					if (tlg.ORG == 5) {
						if (tlg.Data3 == 0x50) {
							this.setState(obj._id + '.state', 0, true);
						}
						if (tlg.Data3 == 0x70) {
							this.setState(obj._id + '.state', 1, true);
						}
					}
					if (tlg.ORG == 7) {
						if (tlg.Data0 == 0x08) {
							this.setState(obj._id + '.state', 0, true);
						}
						if (tlg.Data0 == 0x09) {
							this.setState(obj._id + '.state', 1, true);
							this.setState(obj._id + '.brightness', tlg.Data2, true);
						}
					}
				}

			} else {
				this.log.warn('Eltako unknown ID ' + senderID);
			}

		} else {
			this.log.warn('Eltako telegram CRC error');
		}
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
			commPort.write(tlg, (err) => {
				if (err) {
					this.log.warn('Eltako telegram error sending data: ' + err);
					return;
				}
			});

			this.log.info('Eltako telegram sent: ' + EltakoTools.telegramToString(tlg));

		} catch (e) {
			// Logfile
			this.log.error('Eltako telegram sent error: ' + e);
		}

	}




	/*
	* Create Eltako Devicelist
	*/
	async createDeviceList() {

		// Path
		let path = '';

		// first delete all


		// Create tree structure

		// Lights
		path = 'lights';
		this.setObjectNotExistsAsync(path, {
			type: 'meta',
			common: {
				name: 'light'
			},
			native: {}
		});

		for (const i in DeviceList.Lights) {

			const subpath = path + '.' + DeviceList.Lights[i].Name;
			this.setObjectNotExistsAsync(subpath, {
				type: 'device',
				common: {
					name: DeviceList.Lights[i].Desc
				},
				native: {
					'Type': DeviceList.Lights[i].Type,
					'Adr': DeviceList.Lights[i].Adr
				}
			});

			// remember
			EltakoData.set(DeviceList.Lights[i].Adr, subpath);

			this.setObjectNotExistsAsync(subpath + '.state', {
				type: 'state',
				common: {
					name: 'light state',
					type: 'number',
					role: 'value',
					read:  true,
					write: true,
					def: DeviceList.Lights[i].Values.State,
				},
				native: {
					'Type': DeviceList.Lights[i].Type,
					'Adr': DeviceList.Lights[i].Adr,
					'Id': DeviceList.Lights[i].Options.Id
				}
			});

			// subscribe
			this.subscribeStates(subpath + '.state');
		}



		// Sockets
		path = 'sockets';
		this.setObjectNotExistsAsync(path, {
			type: 'meta',
			common: {
				name: 'sockets'
			},
			native: {}
		});

		/*
		for (const i in DeviceList.Sockets) {

			const subpath = path + '.' + DeviceList.Sockets[i].Name;
			this.setObjectNotExistsAsync(subpath, {
				type: 'device',
				common: {
					name: DeviceList.Sockets[i].Desc
				},
				native: {
					'Type': DeviceList.Sockets[i].Type,
					'Adr': DeviceList.Sockets[i].Adr
				}
			});

			// remember
			EltakoData.set(DeviceList.Sockets[i].Adr, subpath);

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
					'Id': DeviceList.Sockets[i].Options.Id
				}
			});

			// subscribe
			this.subscribeStates(subpath + '.state');
		}
		*/

		// Dimmer
		path = 'dimmer';
		this.setObjectNotExistsAsync(path, {
			type: 'meta',
			common: {
				name: 'dimmer'
			},
			native: {}
		});

		for (const i in DeviceList.Dimmer) {

			const subpath = path + '.' + DeviceList.Dimmer[i].Name;
			this.setObjectNotExistsAsync(subpath, {
				type: 'device',
				common: {
					name: DeviceList.Dimmer[i].Desc
				},
				native: {
					'Type': DeviceList.Dimmer[i].Type,
					'Adr': DeviceList.Dimmer[i].Adr
				}
			});

			// remember
			EltakoData.set(DeviceList.Dimmer[i].Adr, subpath);

			this.setObjectNotExistsAsync(subpath + '.state', {
				type: 'state',
				common: {
					name: 'dimmer state',
					type: 'number',
					role: 'value',
					read:  true,
					write: true,
					def: DeviceList.Dimmer[i].Values.State,
				},
				native: {
					'Type': DeviceList.Dimmer[i].Type,
					'Adr': DeviceList.Dimmer[i].Adr,
					'Id': DeviceList.Dimmer[i].Options.Id
				}
			});

			// subscribe
			this.subscribeStates(subpath + '.state');

			this.setObjectNotExistsAsync(subpath + '.speed', {
				type: 'state',
				common: {
					name: 'dimmer speed',
					type: 'number',
					role: 'value',
					read:  true,
					write: true,
					def: DeviceList.Dimmer[i].Values.Speed,
				},
				native: {
					'Type': DeviceList.Dimmer[i].Type,
					'Adr': DeviceList.Dimmer[i].Adr,
					'Id': DeviceList.Dimmer[i].Options.Id
				}
			});

			// subscribe
			this.subscribeStates(subpath + '.speed');

			this.setObjectNotExistsAsync(subpath + '.brightness', {
				type: 'state',
				common: {
					name: 'dimmer brightness',
					type: 'number',
					role: 'value',
					read:  true,
					write: true,
					def: DeviceList.Dimmer[i].Values.Bright,
				},
				native: {
					'Type': DeviceList.Dimmer[i].Type,
					'Adr': DeviceList.Dimmer[i].Adr,
					'Id': DeviceList.Dimmer[i].Options.Id
				}
			});

			// subscribe
			this.subscribeStates(subpath + '.brightness');
		}

		// Blinds
		path = 'blinds';
		this.setObjectNotExistsAsync(path, {
			type: 'meta',
			common: {
				name: 'blinds'
			},
			native: {}
		});

		for (const i in DeviceList.Blinds) {

			const subpath = path + '.' + DeviceList.Blinds[i].Name;
			this.setObjectNotExistsAsync(subpath, {
				type: 'device',
				common: {
					name: DeviceList.Blinds[i].Desc
				},
				native: {
					'Type': DeviceList.Blinds[i].Type,
					'Adr': DeviceList.Blinds[i].Adr
				}
			});

			// remember
			EltakoData.set(DeviceList.Blinds[i].Adr, subpath);

			this.setObjectNotExistsAsync(subpath + '.position', {
				type: 'state',
				common: {
					name: 'blind position',
					type: 'number',
					role: 'value',
					read:  true,
					write: true,
					def: DeviceList.Blinds[i].Values.Position,
				},
				native: {
					'Type': DeviceList.Blinds[i].Type,
					'Adr': DeviceList.Blinds[i].Adr,
					'Id': DeviceList.Blinds[i].Options.Id
				}
			});

			// subscribe
			this.subscribeStates(subpath + '.position');

			this.setObjectNotExistsAsync(subpath + '.angle', {
				type: 'state',
				common: {
					name: 'blind angle',
					type: 'number',
					role: 'value',
					read:  true,
					write: true,
					def: DeviceList.Blinds[i].Values.Speed,
				},
				native: {
					'Type': DeviceList.Blinds[i].Type,
					'Adr': DeviceList.Blinds[i].Adr,
					'Id': DeviceList.Blinds[i].Options.Id
				}
			});

			// subscribe
			this.subscribeStates(subpath + '.angle');
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