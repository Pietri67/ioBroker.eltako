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

			// initialize communication
			if (this.commPort != null) {

				// A transform stream that emits data as a buffer after a specific number of bytes are received.
				this.commParser = this.commPort.pipe(new ByteLengthParser({ length: 14 }));

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
			// update connection state.
			this.setState('info.connection', false, true);

			// Here you must clear all timeouts or intervals that may still be active
			// stop communication
			if (this.commPort != null) {
				this.commPort.close();
			}

		}  finally  {

			// and finish...
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

			// state.from
			// example: system.adapter.eltako.0.
			const adaptTmp = state.from.split('.');
			const adaptFrom = adaptTmp.slice(0,3).join('.');

			if (adaptFrom !== 'system.adapter.eltako') {

				// state -> eltako.0.lights.floor3.on changed: true (ack = false) from: system.adapter.admin.0
				// state -> eltako.0.lights.floor2.on changed: true (ack = false) from: system.adapter.socketio.0
				// state -> eltako.0.lights.floor3.on changed: false (ack = true) from: system.adapter.eltako.0

				const idTmp = id.split('.');												// split into new array
				const idChannel = idTmp.slice(0,-1).join('.');  							// result: eltako.0.lights.floor3
				const idType = (idTmp.slice(idTmp.length - 1, idTmp.length)).toString(); 	// result: on

				if (obj)  {
					switch (obj.native.Type) {
						case 'FSR14':	// Light, Sockets
							/*
							ORG = 0x07
							Data_byte3 = 0x01
							Data_byte2 = no used
							Data_byte1 = no used
							Data_byte0 = DB0_Bit3 = LRN Button
										(0 = Lerntelegramm, 1 = Datentelegramm)
										DBO_Bit2 = 1: Schaltzustand blockieren,
										0: Schaltzustand nicht blockieren
										DBO_Bit0 = 1: Schaltausgang AN,
										0: Schaltausgang AUS
							*/
							if (idType == 'on') {
								// Light on 0x09, off 0x08
								this.sendEltakoTlg(obj.native.Id, 0x07, 1, 0, 0, ((state.val == 1) ? 0x09 : 0x08));
							}
							if (idType == 'uzsu') {
								//
							}
							break;

						case 'FDG14':
						case 'FSG14':
						case 'FUD14':	// Dimmmer
							/*
								ORG = 0x07
								Data_byte3 = 0x02
								Data_byte2 = Dimmwert in % von 0-100 dez.
								Data_byte1 = Dimmgeschwindigkeit
											 0x00 = die am Dimmer eingestellte
											 Dimmgeschwindigkeit wird verwendet.
											 0x01 = sehr schnelle Dimmspeed …. Bis …
											 0xFF = sehr langsame Dimmspeed
								Data_byte0 = DB0_Bit3 = LRN Button
							*/

							if (idType == 'on') {
								const speed = await this.getStateAsync(idChannel + '.speed');
								const brightness = await this.getStateAsync(idChannel + '.brightness');
								if ((speed != null) && (brightness != null)) {
									this.sendEltakoTlg(obj.native.Id, 0x07, 2, brightness.val, speed.val, ((state.val == 1) ? 0x09 : 0x08));
								} else {
									this.sendEltakoTlg(obj.native.Id, 0x07, 2, 100, 0, ((state.val == 1) ? 0x09 : 0x08));
								}
							}

							if (idType == 'speed') {
								const on = await this.getStateAsync(idChannel + '.on');
								const brightness = await this.getStateAsync(idChannel + '.brightness');
								if ((on != null) && (brightness != null)) {
									this.sendEltakoTlg(obj.native.Id, 0x07, 2, brightness.val, state.val, ((on.val == 1) ? 0x09 : 0x08));
								}
							}

							if (idType == 'brightness') {
								const on = await this.getStateAsync(idChannel + '.on');
								const speed = await this.getStateAsync(idChannel + '.speed');
								if ((on != null) && (speed != null)) {
									this.sendEltakoTlg(obj.native.Id, 0x07, 2, state.val, speed.val, ((on.val == 1) ? 0x09 : 0x08));
								}
							}

							if (idType == 'uzsu') {
								//
							}
							break;

						case 'FTS14':	// Garage
							if (idType == 'open') {
								if (state.val === 1) {
									this.simulateKeyPressed(obj.native.Id, obj.native.Mode);
								}
							}
							break;

						case 'FTS14EM':	// nur Keys
							if (state.val === 1) {
								this.simulateKeyPressed(obj.native.Id, obj.native.Mode);
							}
							break;

						case 'FSB14':	// Blinds
							if (idType == 'cmd') {
								if (state.val === 0) {
									// Stop
									this.sendEltakoTlg(obj.native.Id, 0x07, 0, 0, 0, 8);
								}
								if (state.val === 1) {
									// Auf
									this.sendEltakoTlg(obj.native.Id, 0x07, 0, 66, 1, 8);
								}
								if (state.val === 2) {
									// Ab
									this.sendEltakoTlg(obj.native.Id, 0x07, 0, 66, 2, 8);
								}
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
		// @ts-ignore
		this.commPort.on('open', () => {

			// update connection state.
			this.setState('info.connection', true, true);

			// setup parser
			// @ts-ignore
			this.commParser.on('data' , (data) => {
				this.parseEltakoTlg(data);
			});

			// Logfile
			this.log.info('Eltako usb/serial port ' + this.config.usbport + ' with baudrate ' + this.config.baudrate + ' opened.');
		});

		// port closed
		// @ts-ignore
		this.commPort.on('close', () => {
			// update connection state.
			this.setState('info.connection', false, true);

			// Logfile
			this.log.info('Eltako usb/serial port ' + this.config.usbport + ' closed.');
		});

		// port error
		// @ts-ignore
		this.commPort.on('error', (error) => {
			// Logfile
			this.log.error('Eltako usb/serial port ' + this.config.usbport + ' error: ' + error);
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
			// @ts-ignore
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
	 * parse eltako telegram
	 * @param {any[]} data
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
							this.setState(obj._id + '.on', 0, true);
						}
						if (tlg.Data3 == 0x70) {
							this.setState(obj._id + '.on', 1, true);
						}
					}

					/*
						ORG = 0x07
						Data_byte3 = 0x02
						Data_byte2 = Dimmwert in % von 0-100 dez.
						Data_byte1 = Dimmgeschwindigkeit
									 0x00 = die am Dimmer eingestellte
									 Dimmgeschwindigkeit wird verwendet.
									 0x01 = sehr schnelle Dimmspeed …. Bis …
									 0xFF = sehr langsame Dimmspeed
						Data_byte0 = DB0_Bit3 = LRN Button
					*/

					if ((obj.native.Type === 'FUD14') || (obj.native.Type === 'FSG14') || (obj.native.Type === 'FDG14'))  {
						if (tlg.ORG == 5) {
							if (tlg.Data3 == 0x50) {
								this.setState(obj._id + '.on', 0, true);
							}
							if (tlg.Data3 == 0x70) {
								this.setState(obj._id + '.on', 1, true);
							}
						}
						if (tlg.ORG == 7) {
							if (tlg.Data0 == 0x08) {
								this.setState(obj._id + '.on', 0, true);
							}
							if (tlg.Data0 == 0x09) {
								this.setState(obj._id + '.on', 1, true);

								// speed
								this.setState(obj._id + '.speed', tlg.Data1, true);

								// brightness
								this.setState(obj._id + '.brightness', tlg.Data2, true);
							}

						}
					}

					if (obj.native.Type === 'FSB14') {
						if (tlg.ORG == 5) {

							if (tlg.Data3 == 0x50) {
								// 100 - geschlossen, 0x50 Endlage unten
								this.setState(obj._id + '.position', 100, true);
								this.setState(obj._id + '.angle', 100, true);
								this.setState(obj._id + '.cmd', 0, true);
								//this.log.info('Eltako Endlage unten');
							}
							if (tlg.Data3 == 0x70) {
								// 0 - offen, 0x70 Endlage oben
								this.setState(obj._id + '.position', 0, true);
								this.setState(obj._id + '.angle', 0, true);
								this.setState(obj._id + '.cmd', 0, true);
								//this.log.info('Eltako Endlage oben');
							}

							if (tlg.Data3 == 0x01) {
								//this.log.info('Eltako start öffnen');
								this.setState(obj._id + '.cmd', 1, true);
							}
							if (tlg.Data3 == 0x02) {
								//this.log.info('Eltako start schließen');
								this.setState(obj._id + '.cmd', 2, true);
							}
						}

						if (tlg.ORG == 7) {
							// Fahrtrichtung -> 1 auf/nach oben, -> 0 zu/nach unten
							const dir = (tlg.Data1 == 1 ? 1 : 0);
							//this.log.info('Eltako Fahrtrichtung ' + dir);

							// Laufzeit in 100ms
							const runningtime = Number((tlg.Data3 * 256) + tlg.Data2);
							//this.log.info('Fahrzeit ' + runningtime);

							// falls cmd aktiv rücksetzen
							this.setState(obj._id + '.cmd', 0, true);

							// Motor steht...
							// Ablauf Jalousie ist immer, zuerst Angle drehen, dann Position einnehmen
							// aktuelle Position holen und max. Verfahrzeit
							const tmpMaxAngleTime = Number(obj.native.Angle)/100;
							const tmpAngle = await this.getStateAsync(obj._id + '.angle');
							if (tmpAngle === null) {
								this.log.info('obj angle NULL');
							}
							else {
								//this.log.info('obj: ' + JSON.stringify(tmpAngle));
							}

							//this.log.info('tmpMaxAngleTime: ' + tmpMaxAngleTime);

							const tmpPosition = await this.getStateAsync(obj._id + '.position');
							if (tmpPosition === null) {
								this.log.info('obj position NULL');
							}
							else {
								//this.log.info('obj: ' + JSON.stringify(tmpPosition));
							}


							const tmpMaxPositionTime = Number(obj.native.UpDown)/100;
							//this.log.info('tmpMaxPositionTime: ' + tmpMaxPositionTime);


							// in 100ms rechnet FSB
							if (dir == 0) {

								// zu fahren
								// @ts-ignore
								const tmpAngleTime = (100 - Number(tmpAngle.val)) * tmpMaxAngleTime / 100 ;
								//this.log.info('AngleTime: ' +  tmpAngleTime.toString() + ' runtime: ' + runningtime);

								// wurde nur der Winkel verändert
								if (tmpAngleTime > runningtime) {
									const diffAngle = runningtime * 100/tmpMaxAngleTime;
									// @ts-ignore
									const newAngle = Number(tmpAngle.val) + diffAngle;
									obj.native.LastAngle = (newAngle > 100) ? 100 : newAngle;
									this.setState(obj._id + '.angle', obj.native.LastAngle, true);
								} else {
									// Lamelle zu
									obj.native.LastAngle = 100;
									this.setState(obj._id + '.angle', 100, true);

									// Position berechnen
									const restPositionTime = runningtime - tmpAngleTime;
									const diffPosition = restPositionTime * 100/tmpMaxPositionTime;
									// @ts-ignore
									const newPosition = tmpPosition.val + diffPosition;

									//this.log.info('NewPos: ' + newPosition + ' diffPos: ' + diffPosition + ' restPos: ' + restPositionTime);
									obj.native.LastPosition = (newPosition > 100) ? 100 : newPosition;
									this.setState(obj._id + '.position', obj.native.LastPosition, true);
								}

							} else {
								// auf fahren
								// @ts-ignore
								const tmpAngleTime = Number(tmpAngle.val) * tmpMaxAngleTime / 100;
								//this.log.info('AngleTime: ' +  tmpAngleTime + ' runtime: ' + runningtime);

								// wurde nur der Winkel verändert
								if (tmpAngleTime > runningtime) {
									const diffAngle = runningtime * 100/tmpMaxAngleTime;
									// @ts-ignore
									const newAngle = tmpAngle.val - diffAngle;
									obj.native.LastAngle = (newAngle < 0) ? 0 : newAngle;
									this.setState(obj._id + '.angle', obj.native.LastAngle, true);
								} else {
									// Lamelle auf
									obj.native.LastAngle = 0;
									this.setState(obj._id + '.angle', 0, true);

									// Position berechnen
									const restPositionTime = runningtime - tmpAngleTime;
									const diffPosition = restPositionTime * 100/tmpMaxPositionTime;
									// @ts-ignore
									const newPosition = Number(tmpPosition.val) - diffPosition;

									//this.log.info('NewPos: ' + newPosition.toString() + ' diffPos: ' + diffPosition.toString() + ' restPos: ' + restPositionTime.toString());
									obj.native.LastPosition = (newPosition < 0) ? 0 : newPosition;
									this.setState(obj._id + '.position', obj.native.LastPosition, true);
								}

							}
						}
					}

					if (obj.native.Type === 'FWS61') {
						if (tlg.Data0 == 40) {
							this.setState(obj._id + '.sunwest', (tlg.Data3 * 150/255 * 1000), true);
							this.setState(obj._id + '.sunsouth', (tlg.Data2 * 150/255 * 1000), true);
							this.setState(obj._id + '.suneast', (tlg.Data1 * 150/255 * 1000), true);
						} else {
							this.setState(obj._id + '.brightness', tlg.Data3 * 1000/255, true);

							if ((tlg.ata2 * 120/255) < 40) {
								this.setState(obj._id + '.temperature', (-40 + tlg.Data2 * 120/255), true);
							} else {
								this.setState(obj._id + '.temperature', (tlg.Data2 * 120/255 - 40), true);
							}

							this.setState(obj._id + '.windspeed', (tlg.Data1 * 70/255), true);
							this.setState(obj._id + '.rain', ((tlg.Data0 == 26) ? 1 : 0), true);
						}
					}

					if (obj.native.Type === 'FAH60') {
						if (tlg.Data2 == 0) {
							this.setState(obj._id + '.brightness', ((tlg.Data3 * 100)/255), true);
						} else {
							this.setState(obj._id + '.brightness', (300 + (tlg.Data2 * 29700)/255), true);
						}
					}

					if (obj.native.Type === 'FAFT60') {
						this.setState(obj._id + '.temperature', (-20.0 + (tlg.Data1 * 80.0)/250.0), true);
						this.setState(obj._id + '.humidity', (tlg.Data2 * 100.0/250.0), true);
						this.setState(obj._id + '.voltage', (tlg.Data3 * 5.1/255.0), true);
					}

					// special keys simulation - Garage relais function
					if (obj.native.Type === 'FTS14') {
						if (tlg.ORG == 5) {
							this.setState(obj._id + '.open', 0, true);
						} else {
							this.log.warn('Eltako FTS14 error, id ' + senderID);
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

	/**
	 * Simulate key pressed....
	 * @param {any} id
	 * @param {any} mode
	 */
	async simulateKeyPressed(id, mode) {

		const self = this;
		// mode != 0
		this.sendEltakoTlg(id, 0x05, mode, 0, 0, 0);

		// after 160ms reset to 0
		this.setTimeout(function() {
			self.sendEltakoTlg(id, 0x05, 0, 0, 0, 0);
		}, 160);
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

			this.setObjectNotExistsAsync(subpath + '.on', {
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
			this.subscribeStates(subpath + '.on');


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

			this.setObjectNotExistsAsync(subpath + '.on', {
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
			this.subscribeStates(subpath + '.on');

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


		// Dimmer
		path = 'dimmer';
		this.setObjectNotExistsAsync(path, {
			type: 'device',
			common: {
				name: 'dimmer'
			},
			native: {}
		});

		for (const i in DeviceList.Dimmer) {

			const subpath = path + '.' + DeviceList.Dimmer[i].Name;
			this.setObjectNotExistsAsync(subpath, {
				type: 'channel',
				common: {
					name: DeviceList.Dimmer[i].Desc
				},
				native: {
					'Type': DeviceList.Dimmer[i].Type,
					'Adr': DeviceList.Dimmer[i].Adr,
					'Id': DeviceList.Dimmer[i].Id
				}
			});

			this.setObjectNotExistsAsync(subpath + '.on', {
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
					'Id': DeviceList.Dimmer[i].Id
				}
			});
			// subscribe
			this.subscribeStates(subpath + '.on');

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
					'Id': DeviceList.Dimmer[i].Id
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
					'Id': DeviceList.Dimmer[i].Id
				}
			});
			// subscribe
			this.subscribeStates(subpath + '.brightness');

			this.setObjectNotExistsAsync(subpath + '.uzsu', {
				type: 'state',
				common: {
					name: 'dimmer timer',
					type: 'string',
					role: 'json',
					read:  true,
					write: true
				},
				native: {
					'Type': DeviceList.Dimmer[i].Type,
					'Adr': DeviceList.Dimmer[i].Adr,
					'Id': DeviceList.Dimmer[i].Id
				}
			});
			// subscribe
			this.subscribeStates(subpath + '.uzsu');

			// remember
			EltakoData.set(DeviceList.Dimmer[i].Adr, subpath);
		}


		// Blinds
		path = 'blinds';
		this.setObjectNotExistsAsync(path, {
			type: 'device',
			common: {
				name: 'blinds'
			},
			native: {}
		});

		for (const i in DeviceList.Blinds) {

			const subpath = path + '.' + DeviceList.Blinds[i].Name;
			this.setObjectNotExistsAsync(subpath, {
				type: 'channel',
				common: {
					name: DeviceList.Blinds[i].Desc
				},
				native: {
					'Type': DeviceList.Blinds[i].Type,
					'Adr': DeviceList.Blinds[i].Adr,
					'Id': DeviceList.Blinds[i].Id,
					'UpDown': DeviceList.Blinds[i].Options.UpDown,
					'Angle': DeviceList.Blinds[i].Options.Angle,
					'LastAngle': 0,
					'LastPosition': 0
				}
			});

			this.setObjectNotExistsAsync(subpath + '.position', {
				type: 'state',
				common: {
					name: 'blind position',
					type: 'number',
					role: 'value',
					read:  true,
					write: true,
					def: DeviceList.Blinds[i].Values.Position
				},
				native: {
					'Type': DeviceList.Blinds[i].Type,
					'Adr': DeviceList.Blinds[i].Adr,
					'Id': DeviceList.Blinds[i].Id,
					'UpDown': DeviceList.Blinds[i].Options.UpDown,
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
					def: DeviceList.Blinds[i].Values.Angle
				},
				native: {
					'Type': DeviceList.Blinds[i].Type,
					'Adr': DeviceList.Blinds[i].Adr,
					'Id': DeviceList.Blinds[i].Id,
					'Angle': DeviceList.Blinds[i].Options.Angle,
				}
			});
			// subscribe
			this.subscribeStates(subpath + '.angle');

			this.setObjectNotExistsAsync(subpath + '.uzsu', {
				type: 'state',
				common: {
					name: 'blind timer',
					type: 'string',
					role: 'json',
					read:  true,
					write: true
				},
				native: {
					'Type': DeviceList.Blinds[i].Type,
					'Adr': DeviceList.Blinds[i].Adr,
					'Id': DeviceList.Blinds[i].Id,
				}
			});
			// subscribe
			this.subscribeStates(subpath + '.uzsu');

			this.setObjectNotExistsAsync(subpath + '.cmd', {
				type: 'state',
				common: {
					name: 'blind cmd',
					type: 'number',
					role: 'value',
					read:  true,
					write: true
				},
				native: {
					'Type': DeviceList.Blinds[i].Type,
					'Adr': DeviceList.Blinds[i].Adr,
					'Id': DeviceList.Blinds[i].Id
				}
			});
			// subscribe
			this.subscribeStates(subpath + '.cmd');

			// remember
			EltakoData.set(DeviceList.Blinds[i].Adr, subpath);
		}

		// Sensoren
		path = 'sensors';
		this.setObjectNotExistsAsync(path, {
			type: 'device',
			common: {
				name: 'sensors'
			},
			native: {}
		});

		for (const i in DeviceList.Sensors) {

			const subpath = path + '.' + DeviceList.Sensors[i].Name;
			this.setObjectNotExistsAsync(subpath, {
				type: 'channel',
				common: {
					name: DeviceList.Sensors[i].Desc
				},
				native: {
					'Type': DeviceList.Sensors[i].Type,
					'Adr': DeviceList.Sensors[i].Adr
				}
			});

			for (const [key, value] of Object.entries(DeviceList.Sensors[i].Values)) {
				this.setObjectNotExistsAsync(subpath + '.' + key, {
					type: 'state',
					common: {
						name: key,
						type: 'number',
						role: 'value',
						read:  true,
						write: false,
						def: value
					},
					native: {
					}
				});
				// subscribe
				this.subscribeStates(subpath + '.' + key);
			}

			// remember
			EltakoData.set(DeviceList.Sensors[i].Adr, subpath);
		}

		// Garage
		path = 'other';
		this.setObjectNotExistsAsync(path, {
			type: 'device',
			common: {
				name: 'other'
			},
			native: {}
		});

		for (const i in DeviceList.Garage) {

			const subpath = path + '.' + DeviceList.Garage[i].Name;
			this.setObjectNotExistsAsync(subpath, {
				type: 'channel',
				common: {
					name: DeviceList.Garage[i].Desc
				},
				native: {
					'Type': DeviceList.Garage[i].Type,
					'Adr': DeviceList.Garage[i].Adr
				}
			});

			this.setObjectNotExistsAsync(subpath + '.open', {
				type: 'state',
				common: {
					name: 'garage state',
					type: 'number',
					role: 'value',
					read:  true,
					write: true,
					def: DeviceList.Garage[i].Values.State,
				},
				native: {
					'Type': DeviceList.Garage[i].Type,
					'Adr': DeviceList.Garage[i].Adr,
					'Id': DeviceList.Garage[i].Id,
					'Mode': DeviceList.Garage[i].Options.Mode
				}
			});
			// subscribe
			this.subscribeStates(subpath + '.open');

			// remember
			EltakoData.set(DeviceList.Garage[i].Adr, subpath);
		}

		// Fire
		path = 'other';
		this.setObjectNotExistsAsync(path, {
			type: 'device',
			common: {
				name: 'other'
			},
			native: {}
		});

		for (const i in DeviceList.Fire) {

			const subpath = path + '.' + DeviceList.Fire[i].Name;
			this.setObjectNotExistsAsync(subpath, {
				type: 'channel',
				common: {
					name: DeviceList.Fire[i].Desc
				},
				native: {
					'Type': DeviceList.Fire[i].Type,
					'Adr': DeviceList.Fire[i].Adr
				}
			});

			this.setObjectNotExistsAsync(subpath + '.on', {
				type: 'state',
				common: {
					name: 'fire state',
					type: 'number',
					role: 'value',
					read:  true,
					write: true,
					def: DeviceList.Fire[i].Values.State,
				},
				native: {
					'Type': DeviceList.Fire[i].Type,
					'Adr': DeviceList.Fire[i].Adr,
					'Id': DeviceList.Fire[i].Id,
				}
			});
			// subscribe
			this.subscribeStates(subpath + '.on');

			// remember
			EltakoData.set(DeviceList.Fire[i].Adr, subpath);
		}

		// Climate
		path = 'climate';
		this.setObjectNotExistsAsync(path, {
			type: 'device',
			common: {
				name: 'climate'
			},
			native: {}
		});

		for (const i in DeviceList.Climate) {

			const subpath = path + '.' + DeviceList.Climate[i].Name;
			this.setObjectNotExistsAsync(subpath, {
				type: 'channel',
				common: {
					name: DeviceList.Climate[i].Desc
				},
				native: {
					'Type': DeviceList.Climate[i].Type,
					'Adr': DeviceList.Climate[i].Adr
				}
			});

			this.setObjectNotExistsAsync(subpath + '.on', {
				type: 'state',
				common: {
					name: 'climate state',
					type: 'number',
					role: 'value',
					read:  true,
					write: true,
					def: DeviceList.Climate[i].Values.State,
				},
				native: {
					'Type': DeviceList.Climate[i].Type,
					'Adr': DeviceList.Climate[i].Adr,
					'Id': DeviceList.Climate[i].Id,

				}
			});
			// subscribe
			this.subscribeStates(subpath + '.on');

			this.setObjectNotExistsAsync(subpath + '.uzsu', {
				type: 'state',
				common: {
					name: 'climate timer',
					type: 'string',
					role: 'json',
					read:  true,
					write: true
				},
				native: {
					'Type': DeviceList.Climate[i].Type,
					'Adr': DeviceList.Climate[i].Adr,
					'Id': DeviceList.Climate[i].Id
				}
			});
			// subscribe
			this.subscribeStates(subpath + '.uzsu');

			// remember
			EltakoData.set(DeviceList.Climate[i].Adr, subpath);
		}

		// Keys
		path = 'keys';
		this.setObjectNotExistsAsync(path, {
			type: 'device',
			common: {
				name: 'keys'
			},
			native: {}
		});

		for (const i in DeviceList.Keys) {
			const subpath = path + '.key_' + DeviceList.Keys[i].Adr;
			this.setObjectNotExistsAsync(subpath, {
				type: 'state',
				common: {
					name: DeviceList.Keys[i].Desc,
					type: 'number',
					role: 'value',
					read:  true,
					write: true,
				},
				native: {
					'Type': DeviceList.Keys[i].Type,
					'Adr': DeviceList.Keys[i].Adr,
				}
			});
			// subscribe
			this.subscribeStates(subpath);

			// remember
			EltakoData.set(DeviceList.Keys[i].Adr, subpath);
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