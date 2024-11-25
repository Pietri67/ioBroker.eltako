'use strict';

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
// const fs = require("fs");
const { SerialPort } = require('serialport')
const { ByteLengthParser } = require('@serialport/parser-byte-length')

const EltakoTools = require('./lib/eltako-tools');


// status Logging
let logEnable = false;

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
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			if (logEnable == true) { this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);}
		} else {
			// The state was deleted
			if (logEnable == true) { this.log.info(`state ${id} deleted`);}
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
			if (logEnable == true) { this.log.info('Eltako usb/serial port ' + this.config.usbport + ' with baudrate ' + this.config.baudrate + ' opened.');}
		});

		// port closed
		this.commPort.on('close', () => {
			// update connection state.
			this.setState('info.connection', false, true);

			// Logfile
			if (logEnable == true) { this.log.info('Eltako usb/serial port ' + this.config.usbport + ' closed.');}
		});

		// port error
		this.commPort.on('error', (error) => {
			// Logfile
			if (logEnable == true) { this.log.info('Eltako usb/serial port ' + this.config.usbport + ' error: ' + error);}
		});
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
		if (logEnable == true) { this.log.info('Eltako telegram receive: ' + EltakoTools.telegramToString(data)); }

		// update info.lastmsg
		this.setState('info.lastmsg', EltakoTools.telegramToString(data), true);

		// Eltako Telegramm
		const tlg = EltakoTools.telegram(data);

		// check CRC sum
		if (EltakoTools.calcTelegramCRC(data) == tlg.CRC)  {
			//
		
		} else {
			// Logfile
			if (logEnable == true) { this.log.warn('Eltako telegram CRC error'); }
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