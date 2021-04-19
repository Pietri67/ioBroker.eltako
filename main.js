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
const DeviceList = require('./admin/devicelist.json');


// Communication Port/Parser
let commPort = null;
let commParser = null;


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
			commPort = new SerialPort(this.config.usbport, {
				baudRate: 57600
			});

			commParser = commPort.pipe(new ByteLength({length: 14}));

			// initialize communication
			await this.communication();
		}

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
	onStateChange(id, state) {
		if (state) {
			// state eltako.0.lights.floor3.state changed: true (ack = false) from: system.adapter.admin.0
			// state eltako.0.lights.floor2.state changed: true (ack = false) from: system.adapter.socketio.0
			// state eltako.0.lights.floor3.state changed: false (ack = true) from: system.adapter.eltako.0


			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack}) from: ${state.from}`);

			// example: system.adapter.eltako.0.lights.floor3.state or
			const adaptTmp = state.from.split('.');
			const adaptFrom = adaptTmp.slice(0,3).join('.');

			if (adaptFrom != 'system.adapter.eltako') {

				// which type and device - lights, dimmer - floor3, floor4...
				const tmp = id.from.split('.');
				const typStr = tmp.slice(2,3);
				const devStr = tmp.slice(3,4);
				const staStr = tmp.slice(4,5);

				if (typStr == 'lights') {
					for (const i in DeviceList.Lights) {
						if (DeviceList.Lights[i].Name == devStr) {
							if (staStr == 'state' ) {
								if (DeviceList.Lights[i].Type == 'FSR14') {

									// default
									let mode = 0x08;
	
									// Light off
									if 	(state.val == false) {
										mode = 0x08;
									}
	
									// Light on
									if 	(state.val == true) {
										mode = 0x09;
									}
	
									// send Telegramm
									this.sendEltakoTlg(DeviceList.Lights[i].Options.Id, 0x07, 1, 0, 0, mode);
								}	
							}	
						}
					}
				}

				if (typStr == 'sockets') {
					for (const i in DeviceList.Sockets) {
						if ((DeviceList.Sockets[i].Name) == devStr) {
							if (staStr == 'state' ) {
								if (DeviceList.Sockets[i].Type == 'FSR14') {

									// default
									let mode = 0x08;
	
									// socket off
									if 	(state.val == false) {
										mode = 0x08;
									}
	
									// socket on
									if 	(state.val == true) {
										mode = 0x09;
									}
	
									// send Telegramm
									this.sendEltakoTlg(DeviceList.Sockets[i].Options.Id, 0x07, 1, 0, 0, mode);
								}
							}
						}
					}
				}

				if (typStr == 'dimmer') {
					for (const i in DeviceList.Dimmer) {
						if (DeviceList.Dimmer[i].Name == devStr) {
							if (DeviceList.Dimmer[i].Type == 'FUD14') {	
								// ask all current dimmer values
								const light = this.getStateAsync(DeviceList.Dimmer[i].Name + '.state');
								const bright = this.getStateAsync(DeviceList.Dimmer[i].Name + '.brightness');
								const speed = this.getStateAsync(DeviceList.Dimmer[i].Name + '.speed');

								// default
								let mode = 0x08;

								// dimmer off
								if 	(light.val == false) {
									mode = 0x08;
								}

								// dimmer on
								if 	(light.val == true) {
									mode = 0x09;
								}

								// send Telegramm
								this.sendEltakoTlg(DeviceList.Sockets[i].Options.Id, 0x07, 2, bright.val, speed.val, mode);
							}
						}
					}
				}

				if (typStr == 'blinds') {
					for (const i in DeviceList.Blinds) {
						if (DeviceList.Blinds[i].Name == devStr) {
							if (DeviceList.Blinds[i].Type == 'FSB14') {	
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
		this.log.info('Eltako Tlg: ' + EltakoTools.TelegramToString(data));

		// update info.lastmsg
		this.setState('info.lastmsg', EltakoTools.TelegramToString(data), true);

		// Telegramm
		const tlg = EltakoTools.Telegram(data);

		// check CRC sum
		if (EltakoTools.CalcTelegramCRC(data) == tlg.CRC)  {

			// CRC pass -> sender ID
			const senderID = EltakoTools.senderID(data);
			this.log.info('Eltako telegram sender ID ' + senderID);

			// search id, in lights
			for (const i in DeviceList.Lights) {
				if (DeviceList.Lights[i].Adr == senderID) {
					if (DeviceList.Lights[i].Type == 'FSR14') {

						// ok, update state to off
						if (tlg.Data3 == 0x50) {
							this.setState('lights.' + DeviceList.Lights[i].Name + '.state', false, true);
						}
						// ok, update state to on
						if (tlg.Data3 == 0x70) {
							this.setState('lights.' + DeviceList.Lights[i].Name + '.state', true, true);
						}
					}
				}
			}

			// search id, in sockets
			for (const i in DeviceList.Sockets) {
				if (DeviceList.Sockets[i].Adr == senderID) {
					if (DeviceList.Sockets[i].Type == 'FSR14') {

						// ok, update state to off
						if (tlg.Data3 == 0x50) {
							this.setState('sockets.' + DeviceList.Sockets[i].Name + '.state', false, true);
						}
						// ok, update state to on
						if (tlg.Data3 == 0x70) {
							this.setState('sockets.' + DeviceList.Sockets[i].Name + '.state', true, true);
						}
					}
				}
			}

			// search id, in dimmer
			for (const i in DeviceList.Dimmer) {
				if (DeviceList.Dimmer[i].Adr == senderID) {
					if (DeviceList.Dimmer[i].Type == 'FSR14') {

						if (tlg.ORG == 0x05) {
							// ok, update state to off
							if (tlg.Data3 == 0x50) {
								this.setState('dimmer.' + DeviceList.Dimmer[i].Name + '.state', false, true);
							}
							// ok, update state to on
							if (tlg.Data3 == 0x70) {
								this.setState('dimmer.' + DeviceList.Dimmer[i].Name + '.state', true, true);
							}
						}

						if (tlg.ORG == 0x07) {
							// ok, update state to off
							if (tlg.Data0 == 0x08) {
								this.setState('dimmer.' + DeviceList.Dimmer[i].Name + '.state', false, true);
							}

							// ok, update state to on
							if (tlg.Data0 == 0x09) {
								this.setState('dimmer.' + DeviceList.Dimmer[i].Name + '.state', true, true);
								this.setState('dimmer.' + DeviceList.Dimmer[i].Name + '.brightness', tlg.Data2, true);
							}
						}
					}
				}
			}

		} else {
			this.log.info('Eltako telegram CRC error');
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

			const arrID = EltakoTools.SenderIDtoBytes(id);

			tlg[8]  = arrID[3];
			tlg[9]  = arrID[2];
			tlg[10] = arrID[1];
			tlg[11] = arrID[0];

			tlg[12] = 0;		// State 0

			tlg[13] = EltakoTools.CalcTelegramCRC(tlg);

			// send Eltako telegram
			commPort.write(tlg);
			this.log.info('Eltako telegram sent: ' + EltakoTools.TelegramToString(tlg));

		} catch (e) {
			// Logfile
			this.log.info('Eltako telegram sent error: ' + e);
		}

	}




	/*
	* Create Eltako Devicelist
	*/
	createDeviceList() {

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
					id: DeviceList.Lights[i].Options.Id
				}
			});

			this.setObjectNotExistsAsync(subpath + '.adr', {
				type: 'state',
				common: {
					name: 'device address',
					type: 'number',
					role: 'value',
					def:  DeviceList.Lights[i].Adr
				},
				native: {}
			});

			this.setObjectNotExistsAsync(subpath + '.type', {
				type: 'state',
				common: {
					name: 'device type',
					type: 'string',
					role: 'value',
					def:  DeviceList.Lights[i].Type
				},
				native: {}
			});

			this.setObjectNotExistsAsync(subpath + '.state', {
				type: 'state',
				common:
				{
					name: 'light state',
					type: 'boolean',
					role: 'indicator',
					def: DeviceList.Lights[i].Values.State
				},
				native: {}
			});

			this.subscribeStates(subpath + '.state');
		}



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
					id: DeviceList.Dimmer[i].Options.Id
				}
			});

			this.setObjectNotExistsAsync(subpath + '.adr', {
				type: 'state',
				common: {
					name: 'device address',
					type: 'number',
					role: 'value',
					def:  DeviceList.Dimmer[i].Adr
				},
				native: {}
			});

			this.setObjectNotExistsAsync(subpath + '.type', {
				type: 'state',
				common:
				{
					name: 'device type',
					type: 'string',
					role: 'value',
					def:  DeviceList.Dimmer[i].Type
				},
				native: {}
			});


			this.setObjectNotExistsAsync(subpath + '.state', {
				type: 'state',
				common:
				{
					name: 'dimmer state',
					type: 'boolean',
					role: 'indicator',
					def:  DeviceList.Dimmer[i].Values.State
				},
				native: {}
			});

			this.setObjectNotExistsAsync(subpath + '.brightness', {
				type: 'state',
				common:
				{
					name: 'dimmer brightness',
					type: 'number',
					role: 'value',
					def:  DeviceList.Dimmer[i].Values.Brightness
				},
				native: {}
			});

			this.setObjectNotExistsAsync(subpath + '.speed', {
				type: 'state',
				common:
				{
					name: 'dimmer speed',
					type: 'number',
					role: 'value',
					def:  DeviceList.Dimmer[i].Values.Speed
				},
				native: {}
			});

		}


		// Blinds
		path = 'blinds';
		this.setObjectNotExistsAsync(path, {
			type: 'meta',
			common:
			{
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
					id: DeviceList.Blinds[i].Options.Id
				}
			});

			this.setObjectNotExistsAsync(subpath + '.adr', {
				type: 'state',
				common: {
					name: 'device address',
					type: 'number',
					role: 'value',
					def:  DeviceList.Blinds[i].Adr
				},
				native: {}
			});

			this.setObjectNotExistsAsync(subpath + '.type', {
				type: 'state',
				common: {
					name: 'device type',
					type: 'string',
					role: 'value',
					def:  DeviceList.Blinds[i].Type
				},
				native: {}
			});


			this.setObjectNotExistsAsync(subpath + '.position', {
				type: 'state',
				common: {
					name: 'blind position',
					type: 'number',
					role: 'value',
					def:  DeviceList.Blinds[i].Values.Position
				},
				native: {}
			});

			this.setObjectNotExistsAsync(subpath + '.angle', {
				type: 'state',
				common:
				{
					name: 'blind angle',
					type: 'number',
					role: 'value',
					def:  DeviceList.Blinds[i].Values.Angle
				},
				native: {}
			});

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

		for (const i in DeviceList.Sockets) {

			const subpath = path + '.' + DeviceList.Sockets[i].Name;
			this.setObjectNotExistsAsync(subpath, {
				type: 'device',
				common: {
					name: DeviceList.Sockets[i].Desc
				},
				native: {
					id: DeviceList.Sockets[i].Options.Id
				}
			});

			this.setObjectNotExistsAsync(subpath + '.adr', {
				type: 'state',
				common: {
					name: 'device address',
					type: 'number',
					role: 'value',
					def:  DeviceList.Sockets[i].Adr
				},
				native: {}
			});

			this.setObjectNotExistsAsync(subpath + '.type', {
				type: 'state',
				common: {
					name: 'device type',
					type: 'string',
					role: 'value',
					def:  DeviceList.Sockets[i].Type
				},
				native: {}
			});


			this.setObjectNotExistsAsync(subpath + '.state', {
				type: 'state',
				common: {
					name: 'socket state',
					type: 'boolean',
					role: 'indicator',
					def: DeviceList.Sockets[i].Values.State
				},
				native: {}
			});
		}


		// Central off
		path = 'centraloff';
		this.setObjectNotExistsAsync(path, {
			type: 'meta',
			common: {
				name: 'central off/close'
			},
			native: {}
		});

		for (const i in DeviceList.CentralOff) {

			const subpath = path + '.' + DeviceList.CentralOff[i].Name;
			this.setObjectNotExistsAsync(subpath, {
				type: 'device',
				common: {
					name: DeviceList.CentralOff[i].Desc
				},
				native: {
					id: DeviceList.CentralOff[i].Options.Id
				}
			});

			this.setObjectNotExistsAsync(subpath + '.state', {
				type: 'state',
				common: {
					name: 'trigger state',
					type: 'boolean',
					role: 'indicator',
					def:  false
				},
				native: {}
			});
		}


		// Central on
		path = 'centralon';
		this.setObjectNotExistsAsync(path, {
			type: 'meta',
			common: {
				name: 'central on/open'
			},
			native: {}
		});

		for (const i in DeviceList.CentralOn) {

			const subpath = path + '.' + DeviceList.CentralOn[i].Name;
			this.setObjectNotExistsAsync(subpath, {
				type: 'device',
				common:
				{
					name: DeviceList.CentralOn[i].Desc
				},
				native: {
					id: DeviceList.CentralOn[i].Options.Id
				}
			});

			this.setObjectNotExistsAsync(subpath + '.state', {
				type: 'state',
				common: {
					name: 'trigger state',
					type: 'boolean',
					role: 'indicator',
					def:  false
				},
				native: {}
			});
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