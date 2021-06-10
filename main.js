/* eslint-disable no-unused-vars */
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
const SunCalc2 = require('suncalc2');

// Communication Port/Parser
let commPort = null;
let commParser = null;

// Eltako Data
let EltakoData = null;

// SunLights
let sunLight = null;

// Events
let FSB14Events = [];
let FSR14Events = [];

class Eltako extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'eltako',
		});

		// Initialize...
		FSB14Events = [];
		FSR14Events = [];

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

		// start suncalc function
		this.calcSunTimes();

		// start event check...
		this.checkUZSUEvents();
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Stop USZU Event
			clearTimeout(this.timeoutUSZU);
			this.timeoutUSZU = null;

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
							if (idType == 'state') {
								// Light on 0x09, off 0x08
								this.sendEltakoTlg(obj.native.Id, 0x07, 1, 0, 0, ((state.val == 1) ? 0x09 : 0x08));
							}
							if (idType == 'uzsu') {
								FSR14Events[obj.native.Index] = this.parseUZSUEvents(obj.native.Id, state);
							}
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

						case 'FSB14':	// Blinds
							if (idType == 'angle') {
								//this.sendEltakoTlg(obj.native.Id, 0x07, dir, 0, 0, 0);
							}

							if (idType == 'position') {
								// 100 - geschlossen, 0 - offen
								// Fahrtrichtung -> 1 auf/nach oben, -> 0 zu/nach unten
								// const dir = (tlg.Data1 == 1 ? 1 : 0);
								if (state.val === 100) {
									//
								}
								if (state.val === 0) {
									//
								}
							}

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

							if (idType == 'uzsu') {
								FSB14Events[obj.native.Index] = this.parseUZSUEvents(obj.native.Id, state);
							}
							break;

						case 'FTS14':	// Special Key
							if (idType == 'state') {
								if (state.val === 1) {
									this.simulateKeyPressed(obj.native.Id, obj.native.Mode);
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
				this.log.info('Eltako Id:' +  senderID + ' iobroker: ' + obj._id);

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
							const tmpAngleTime = (100 - Number(tmpAngle.val)) * tmpMaxAngleTime / 100 ;
							//this.log.info('AngleTime: ' +  tmpAngleTime.toString() + ' runtime: ' + runningtime);

							// wurde nur der Winkel verändert
							if (tmpAngleTime > runningtime) {
								const diffAngle = runningtime * 100/tmpMaxAngleTime;
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
								const newPosition = tmpPosition.val + diffPosition;

								//this.log.info('NewPos: ' + newPosition + ' diffPos: ' + diffPosition + ' restPos: ' + restPositionTime);
								obj.native.LastPosition = (newPosition > 100) ? 100 : newPosition;
								this.setState(obj._id + '.position', obj.native.LastPosition, true);
							}

						} else {
							// auf fahren
							const tmpAngleTime = Number(tmpAngle.val) * tmpMaxAngleTime / 100;
							//this.log.info('AngleTime: ' +  tmpAngleTime + ' runtime: ' + runningtime);

							// wurde nur der Winkel verändert
							if (tmpAngleTime > runningtime) {
								const diffAngle = runningtime * 100/tmpMaxAngleTime;
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

				if (obj.native.Type === 'FTS14EM') {
					if (tlg.ORG == 5) {
						this.setState(obj._id, (tlg.Data3 !== 0 ? 1 : 0), true);
					} else {
						this.log.warn('Eltako FTS14EM error, id ' + senderID);
					}
				}

				// special keys simulation - Garage relais function
				if (obj.native.Type === 'FTS14') {
					if (tlg.ORG == 5) {
						this.setState(obj._id + '.state', 0, true);
					} else {
						this.log.warn('Eltako FTS14 error, id ' + senderID);
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
	* Simulate key pressed....
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
	 * Check all UZSU events
	*/
	checkUZSUEvents() {
		this.timeoutUSZU = setTimeout(this.checkUZSUEvents.bind(this), 5000);
		const self = this;

		// current day,  at 00.00.00 clock
		const d = new Date();
		d.setHours(0);
		d.setMinutes(0);
		d.setSeconds(0);
		d.setMilliseconds(0);

		// time between current an midnight in ms
		const midnightTime = d.getTime();
		const nextDay = midnightTime + (86400 * 1000);

		// current time in ms
		const currentDate = new Date();
		const currentTime = currentDate.getTime();

		// day number 0-Sunday, 1-Monday ...
		const day = currentDate.getDay();


		// check all blind devices uzsu
		FSB14Events.forEach(function(device) {
			device.forEach(function(event) {

				//self.log.info('id: ' + event.Id + ' fired: ' + event.fired + ' time: ' + currentTime + ' midnight: ' + midnightTime);

				if ((event.active === true) && ((currentTime > event.fired) || (event.fired == 0))) {

					//self.log.info('type: ' + event.type + ' day: ' + day + ' val: ' + event.value);

					// POT prüfen
					if (event.type === 0) {
						if (event.days[day] === true) {
							const pot = (EltakoTools.parseTime(event.pot)).getTime();
							if (pot < currentTime) {
								// Fired
								event.fired = nextDay;

								if (event.value == 0) { // Auf
									self.sendEltakoTlg(event.Id, 0x07, 0, 66, 1, 8);
								}
								if (event.value == 1) { // Zu
									self.sendEltakoTlg(event.Id, 0x07, 0, 66, 2, 8);
								}
							}
						}
					}

					// Sunrise
					if ((event.type === 1) && (event.days[day] === true)) {

						const sunrise = sunLight.sunrise.getTime();
						//sunrise += event.offset;

						let timeMax = 0;
						try {
							timeMax = (EltakoTools.parseTime(event.timeMax)).getTime();
						} catch (error) {
							timeMax = midnightTime;
						}

						let timeMin = 0;
						try {
							timeMin = (EltakoTools.parseTime(event.timeMin)).getTime();
						} catch (error) {
							timeMin = midnightTime;
						}

						//self.log.info('sunrise: ' + sunrise  + ' midnight: ' + midnightTime);
						//self.log.info('min: ' + timeMin + ' max: ' + timeMax + ' currentMS: ' + currentMS);

						if ((timeMax < currentTime) && (midnightTime != timeMax)) {
							event.fired = nextDay;

							if (event.value == 0) { // Auf
								self.sendEltakoTlg(event.Id, 0x07, 0, 66, 1, 8);
							}
							if (event.value == 1) { // Zu
								self.sendEltakoTlg(event.Id, 0x07, 0, 66, 2, 8);
							}

						} else {
							if (midnightTime != timeMin) {
								if ((timeMin < sunrise) && (sunrise < currentTime)) {
									event.fired = nextDay;

									if (event.value == 0) { // Auf
										self.sendEltakoTlg(event.Id, 0x07, 0, 66, 1, 8);
									}
									if (event.value == 1) { // Zu
										self.sendEltakoTlg(event.Id, 0x07, 0, 66, 2, 8);
									}

								} else {
									if ((sunrise < timeMin) && (timeMin < currentTime)) {
										event.fired = nextDay;

										if (event.value == 0) { // Auf
											self.sendEltakoTlg(event.Id, 0x07, 0, 66, 1, 8);
										}
										if (event.value == 1) { // Zu
											self.sendEltakoTlg(event.Id, 0x07, 0, 66, 2, 8);
										}
									}
								}
							} else {
								if (sunrise < currentTime) {
									event.fired = nextDay;

									if (event.value == 0) { // Auf
										self.sendEltakoTlg(event.Id, 0x07, 0, 66, 1, 8);
									}
									if (event.value == 1) { // Zu
										self.sendEltakoTlg(event.Id, 0x07, 0, 66, 2, 8);
									}
								}
							}
						}
					}

					// Sunset
					if ((event.type === 2) && (event.days[day] === true)) {

						const sunset = sunLight.sunset.getTime();
						// sunset += event.offset;

						let timeMax = 0;
						try {
							timeMax = (EltakoTools.parseTime(event.timeMax)).getTime();
						} catch (error) {
							timeMax = midnightTime;
						}

						let timeMin = 0;
						try {
							timeMin = (EltakoTools.parseTime(event.timeMin)).getTime();
						} catch (error) {
							timeMin = midnightTime;
						}

						//self.log.info('sunset: ' + sunset  + ' midnight: ' + midnightTime);
						//self.log.info('min: ' + timeMin + ' max: ' + timeMax + ' nextday: ' + nextDay);

						if ((timeMax < currentTime) && (midnightTime != timeMax)) {
							event.fired = nextDay;

							if (event.value == 0) { // Auf
								self.sendEltakoTlg(event.Id, 0x07, 0, 66, 1, 8);
							}
							if (event.value == 1) { // Zu
								self.sendEltakoTlg(event.Id, 0x07, 0, 66, 2, 8);
							}

						} else {
							if (midnightTime != timeMin) {
								if ((timeMin < sunset) && (sunset < currentTime)) {
									event.fired = nextDay;

									if (event.value == 0) { // Auf
										self.sendEltakoTlg(event.Id, 0x07, 0, 66, 1, 8);
									}
									if (event.value == 1) { // Zu
										self.sendEltakoTlg(event.Id, 0x07, 0, 66, 2, 8);
									}

								} else {
									if ((sunset < timeMin) && (timeMin < currentTime)) {
										event.fired = nextDay;

										if (event.value == 0) { // Auf
											self.sendEltakoTlg(event.Id, 0x07, 0, 66, 1, 8);
										}
										if (event.value == 1) { // Zu
											self.sendEltakoTlg(event.Id, 0x07, 0, 66, 2, 8);
										}
									}
								}
							} else {
								if (sunset < currentTime) {
									event.fired = nextDay;

									if (event.value == 0) { // Auf
										self.sendEltakoTlg(event.Id, 0x07, 0, 66, 1, 8);
									}
									if (event.value == 1) { // Zu
										self.sendEltakoTlg(event.Id, 0x07, 0, 66, 2, 8);
									}
								}
							}
						}

					}

				}
			});
		});
	}

	/*
	 *  Calc SunTimes, Positions....
	*/
	calcSunTimes() {
		this.timeoutSUN = setTimeout(this.calcSunTimes.bind(this), 3600000);

		const self = this;
		sunLight = SunCalc2.getTimes(new Date(), 51.02, 13.71);

		//const sunrise = sunLight.sunrise.getTime();
		//self.log.info('sunrise ' + sunrise);
		//const sunset = sunLight.sunset.getTime();
		//self.log.info('sunset ' + sunset);
	}

	/*
	* parse UZSU events
	*/
	parseUZSUEvents(id, state) {
		// empty events
		const events = [];

		//	weekdays				 0     1     2     3     4     5     6
		const  weekDays = [ 'So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'  ];

		const uzsu = state.val;
		try {
			JSON.parse(uzsu);
		} catch (error) {
			return events;
		}
		const objJSON = JSON.parse(uzsu);

		let idx = 0;
		objJSON.list.forEach(function(item) {

			events[idx] = {};
			events[idx].days = [];

			// event active
			events[idx].fired = 0;
			events[idx].active = item.active;

			// Type
			switch (item.event) {
				case 'time':
					events[idx].type = 0;
					break;
				case 'sunrise':
					events[idx].type = 1;
					break;
				case 'sunset':
					events[idx].type = 2;
					break;
				default:
					events[idx].type = 0;
					break;
			}

			// Zeit
			events[idx].pot = item.timeCron;
			events[idx].timeMin = item.timeMin;
			events[idx].timeMax = item.timeMax;

			// offset -> in ms
			try {
				let offset = parseInt(item.timeOffset);
				offset = offset * 60000;
				events[idx].offset = offset;
			} catch (error) {
				events[idx].offset = 0;
			}

			// Value == STRING
			events[idx].value = item.value;

			// Wochentage
			for (let numberOfDay = 0; numberOfDay < 7; numberOfDay++) {
				events[idx].days[numberOfDay] = (item.rrule.indexOf(weekDays[numberOfDay]) != -1 ? true : false);
			}

			events[idx].Id = id;
			idx++;
		});

		return events;
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
					'Id': DeviceList.Lights[i].Options.Id
				}
			});

			// subscribe
			this.subscribeStates(subpath + '.uzsu');
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
					'Id': DeviceList.Sockets[i].Options.Id
				}
			});

			// subscribe
			this.subscribeStates(subpath + '.uzsu');
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
					'Id': DeviceList.Dimmer[i].Options.Id
				}
			});

			// subscribe
			this.subscribeStates(subpath + '.uzsu');
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
					'Adr': DeviceList.Blinds[i].Adr,
					'UpDown': DeviceList.Blinds[i].Options.UpDown,
					'Angle': DeviceList.Blinds[i].Options.Angle,
					'LastAngle': 0,
					'LastPosition': 0
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
					def: DeviceList.Blinds[i].Values.Position
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
					def: DeviceList.Blinds[i].Values.Angle
				},
				native: {
					'Type': DeviceList.Blinds[i].Type,
					'Adr': DeviceList.Blinds[i].Adr,
					'Id': DeviceList.Blinds[i].Options.Id
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
					'Index': i,
					'Type': DeviceList.Blinds[i].Type,
					'Adr': DeviceList.Blinds[i].Adr,
					'Id': DeviceList.Blinds[i].Options.Id
				}
			});

			// subscribe
			this.subscribeStates(subpath + '.uzsu');

			// if object exists...
			try {
				const state = await this.getStateAsync(subpath + '.uzsu');
				FSB14Events[i] = this.parseUZSUEvents(DeviceList.Blinds[i].Options.Id, state);
			} catch (error) {
				// ignore
			}


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
					'Id': DeviceList.Blinds[i].Options.Id
				}
			});

			// subscribe
			this.subscribeStates(subpath + '.cmd');
		}

		// Sensoren
		path = 'sensors';
		this.setObjectNotExistsAsync(path, {
			type: 'meta',
			common: {
				name: 'sensors'
			},
			native: {}
		});

		for (const i in DeviceList.Sensors) {

			const subpath = path + '.' + DeviceList.Sensors[i].Name;
			this.setObjectNotExistsAsync(subpath, {
				type: 'device',
				common: {
					name: DeviceList.Sensors[i].Desc
				},
				native: {
					'Type': DeviceList.Sensors[i].Type,
					'Adr': DeviceList.Sensors[i].Adr
				}
			});

			// remember
			EltakoData.set(DeviceList.Sensors[i].Adr, subpath);

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
			}
		}

		// Garage
		path = 'other';
		this.setObjectNotExistsAsync(path, {
			type: 'meta',
			common: {
				name: 'other'
			},
			native: {}
		});

		for (const i in DeviceList.Garage) {

			const subpath = path + '.' + DeviceList.Garage[i].Name;
			this.setObjectNotExistsAsync(subpath, {
				type: 'device',
				common: {
					name: DeviceList.Garage[i].Desc
				},
				native: {
					'Type': DeviceList.Garage[i].Type,
					'Adr': DeviceList.Garage[i].Adr
				}
			});

			// remember
			EltakoData.set(DeviceList.Garage[i].Adr, subpath);

			this.setObjectNotExistsAsync(subpath + '.state', {
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
					'Id': DeviceList.Garage[i].Options.Id,
					'Mode': DeviceList.Garage[i].Options.Mode
				}
			});

			// subscribe
			this.subscribeStates(subpath + '.state');
		}

		// Fire
		path = 'other';
		this.setObjectNotExistsAsync(path, {
			type: 'meta',
			common: {
				name: 'other'
			},
			native: {}
		});

		for (const i in DeviceList.Fire) {

			const subpath = path + '.' + DeviceList.Fire[i].Name;
			this.setObjectNotExistsAsync(subpath, {
				type: 'device',
				common: {
					name: DeviceList.Fire[i].Desc
				},
				native: {
					'Type': DeviceList.Fire[i].Type,
					'Adr': DeviceList.Fire[i].Adr
				}
			});

			// remember
			EltakoData.set(DeviceList.Fire[i].Adr, subpath);

			this.setObjectNotExistsAsync(subpath + '.state', {
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
					'Id': DeviceList.Fire[i].Options.Id,
				}
			});

			// subscribe
			this.subscribeStates(subpath + '.state');
		}


		// Climate
		path = 'climate';
		this.setObjectNotExistsAsync(path, {
			type: 'meta',
			common: {
				name: 'climate'
			},
			native: {}
		});

		for (const i in DeviceList.Climate) {

			const subpath = path + '.' + DeviceList.Climate[i].Name;
			this.setObjectNotExistsAsync(subpath, {
				type: 'device',
				common: {
					name: DeviceList.Climate[i].Desc
				},
				native: {
					'Type': DeviceList.Climate[i].Type,
					'Adr': DeviceList.Climate[i].Adr
				}
			});

			// remember
			EltakoData.set(DeviceList.Climate[i].Adr, subpath);

			this.setObjectNotExistsAsync(subpath + '.state', {
				type: 'state',
				common: {
					name: 'other state',
					type: 'number',
					role: 'value',
					read:  true,
					write: true,
					def: DeviceList.Climate[i].Values.State,
				},
				native: {
					'Type': DeviceList.Climate[i].Type,
					'Adr': DeviceList.Climate[i].Adr,
					'Id': DeviceList.Climate[i].Options.Id,

				}
			});

			// subscribe
			this.subscribeStates(subpath + '.state');

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
					'Id': DeviceList.Climate[i].Options.Id
				}
			});

			// subscribe
			this.subscribeStates(subpath + '.uzsu');
		}

		// Keys
		path = 'keys';
		this.setObjectNotExistsAsync(path, {
			type: 'meta',
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