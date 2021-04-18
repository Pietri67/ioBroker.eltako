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
const DeviceList = require('./admin/devicelist.json');


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

        // Reset the connection indicator during startup
        await this.setStateAsync('info.connection', false, true);

		// Initialize your adapter here
		const port = new SerialPort(this.config.usbport, {
			baudRate: 57600
		});

		const parser = port.pipe(new ByteLength({length: 14}));

		port.on('error', (error) => {
			this.log.info('Eltako usb/serial port ' + this.config.usbport + ' error: ' + error);
		});

		port.on('open', () => {
			this.log.info('Eltako usb/serial port ' + this.config.usbport + ' with baudrate ' + this.config.baudrate + ' opened.');	
		});

		port.on('close', () => {
			this.log.info('Eltako usb/serial port ' + this.config.usbport + ' closed.');	
		});


		// create eltako devices
		this.createDeviceList();


		// Update connection state.
		this.setState('info.connection', true, true);


		// Eltako TLG Data /* A5 5A 0B 05 50 00 00 00 00 15 B7 FE 30 5A */
		/* 	STRUCT
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
		*/

		parser.on('data', (data) => {	

			let lastmsg = data[0] + ',' + data[1] + ',' + data[2] + ',' + data[3] 
			+ ',' + data[4] + ',' + data[5] + ',' + data[6] + ',' + data[7] + ',' + data[8] 
			+ ',' + data[9] + ',' + data[10] + ',' + data[11] + ',' + data[12] + ',' + data[13];

			this.log.info('Eltako Tlg: ' + lastmsg);

			// update info.lastmsg
			this.setState('info.lastmsg', lastmsg, true);


			// test CRC 
			let i;
			let CRC = 0;		
			for (i = 2; i < 13; i++) {
  				CRC += Number(data[i]);
			} 
			CRC = CRC % 256;

			// check CRC sum *)
			if (CRC == Number(data[13]))  {
				// CRC pass -> sender ID
				let senderID = Number(data[11]) + (Number(data[10]) * 256) + (Number(data[9]) * 65535) + (Number(data[8]) * 16777216);
				this.log.info('Eltako telegram sender ID ' + senderID);

			} else {
				this.log.info('Eltako telegram CRC error ' + CRC);	
			}

		});
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active

			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === 'object' && obj.message) {
	// 		if (obj.command === 'send') {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info('send command');

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
	// 		}
	// 	}
	// }


	createDeviceList() {
        
		// Path
		let path = '';

		// Create tree structure 
		path = 'lights';
		this.setObjectNotExistsAsync(path, 
		{
			type: 'meta',
			common: 
			{
				name: 'Licht'
			},
			native: {}
		});

		for (const i in DeviceList.Lights) {

			let subpath = path + '.' + DeviceList.Lights[i].Name;
	        this.setObjectNotExistsAsync(subpath, 
			{
				type: 'device',
				common: 
				{
					name: DeviceList.Lights[i].Desc
				},
				native: {}
			});

	        this.setObjectNotExistsAsync(subpath + '.adr', 
			{
				type: 'state',
				common: 
				{
					name: 'device address', 
					type: 'number', 
					role: 'value', 
					def:  DeviceList.Lights[i].Adr
				},
				native: {}
			});

			this.setObjectNotExistsAsync(subpath + '.type', 
			{
				type: 'state',
				common: 
				{
					name: 'device type', 
					type: 'string', 
					role: 'value', 
					def:  DeviceList.Lights[i].Type
				},
				native: {}
			});


			this.setObjectNotExistsAsync(subpath + '.state', 
			{
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
		}




		path = 'dimmer';
		this.setObjectNotExistsAsync(path, 
		{
			type: 'meta',
			common: 
			{
				name: 'Dimmer'
			},
			native: {}
		});

		for (const i in DeviceList.Dimmer) {

			let subpath = path + '.' + DeviceList.Dimmer[i].Name;
	        this.setObjectNotExistsAsync(path + '.' + DeviceList.Dimmer[i].Name, 
			{
				type: 'device',
				common: 
				{
					name: DeviceList.Dimmer[i].Desc
				},
				native: {}
			});

	        this.setObjectNotExistsAsync(subpath + '.adr', 
			{
				type: 'state',
				common: 
				{
					name: 'device address', 
					type: 'number', 
					role: 'value', 
					def:  DeviceList.Dimmer[i].Adr
				},
				native: {}
			});

			this.setObjectNotExistsAsync(subpath + '.type', 
			{
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


			this.setObjectNotExistsAsync(subpath + '.state', 
			{
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

			this.setObjectNotExistsAsync(subpath + '.brightness', 
			{
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

			this.setObjectNotExistsAsync(subpath + '.speed', 
			{
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

		

		path = 'blinds';
		this.setObjectNotExistsAsync(path, 
		{
			type: 'meta',
			common: 
			{
				name: 'Jalousien'
			},
			native: {}
		});

		for (const i in DeviceList.Blinds) {

			let subpath = path + '.' + DeviceList.Blinds[i].Name;
	        this.setObjectNotExistsAsync(path + '.' +  DeviceList.Blinds[i].Name, 
			{
				type: 'device',
				common: 
				{
					name: DeviceList.Blinds[i].Desc
				},
				native: {}
			});

	        this.setObjectNotExistsAsync(subpath + '.adr', 
			{
				type: 'state',
				common: 
				{
					name: 'device address', 
					type: 'number', 
					role: 'value', 
					def:  DeviceList.Blinds[i].Adr
				},
				native: {}
			});

			this.setObjectNotExistsAsync(subpath + '.type', 
			{
				type: 'state',
				common: 
				{
					name: 'device type', 
					type: 'string', 
					role: 'value', 
					def:  DeviceList.Blinds[i].Type
				},
				native: {}
			});


			this.setObjectNotExistsAsync(subpath + '.position', 
			{
				type: 'state',
				common: 
				{
					name: 'blind position', 
					type: 'number', 
					role: 'value', 
					def:  DeviceList.Blinds[i].Values.Position
				},
				native: {}
			});

			this.setObjectNotExistsAsync(subpath + '.angle', 
			{
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

		

		path = 'sockets';
		this.setObjectNotExistsAsync(path, 
		{
			type: 'meta',
			common: 
			{
				name: 'Steckdosen'
			},
			native: {}
		});

		for (const i in DeviceList.Sockets) {

			let subpath = path + '.' + DeviceList.Sockets[i].Name;
	        this.setObjectNotExistsAsync(path + '.' +  DeviceList.Sockets[i].Name, 
			{
				type: 'device',
				common: 
				{
					name: DeviceList.Sockets[i].Desc
				},
				native: {}
			});

	        this.setObjectNotExistsAsync(subpath + '.adr', 
			{
				type: 'state',
				common: 
				{
					name: 'device address', 
					type: 'number', 
					role: 'value', 
					def:  DeviceList.Sockets[i].Adr
				},
				native: {}
			});

			this.setObjectNotExistsAsync(subpath + '.type', 
			{
				type: 'state',
				common: 
				{
					name: 'device type', 
					type: 'string', 
					role: 'value', 
					def:  DeviceList.Sockets[i].Type
				},
				native: {}
			});


			this.setObjectNotExistsAsync(subpath + '.state', 
			{
				type: 'state',
				common: 
				{
					name: 'socket state', 
					type: 'boolean', 
					role: 'indicator', 
					def: DeviceList.Sockets[i].Values.State
				},
				native: {}
			});
		}



		path = 'centraloff';
		this.setObjectNotExistsAsync(path, 
		{
			type: 'meta',
			common: 
			{
				name: 'Zentral Aus/Zu'
			},
			native: {}
		});

		for (const i in DeviceList.CentralOff) {

			let subpath = path + '.' + DeviceList.CentralOff[i].Name;
	        this.setObjectNotExistsAsync(path + '.' +  DeviceList.CentralOff[i].Name, 
			{
				type: 'device',
				common: 
				{
					name: DeviceList.CentralOff[i].Desc
				},
				native: {}
			});

			this.setObjectNotExistsAsync(subpath + '.state', 
			{
				type: 'state',
				common: 
				{
					name: 'trigger state', 
					type: 'boolean', 
					role: 'indicator', 
					def:  false
				},
				native: {}
			});
		}


		
		path = 'centralon';
		this.setObjectNotExistsAsync(path, 
		{
			type: 'meta',
			common: 
			{
				name: 'Zentral An/Auf'
			},
			native: {}
		});

		for (const i in DeviceList.CentralOn) {

			let subpath = path + '.' + DeviceList.CentralOn[i].Name;
	        this.setObjectNotExistsAsync(path + '.' +  DeviceList.CentralOn[i].Name, {
				type: 'device',
				common: 
				{
					name: DeviceList.CentralOn[i].Desc
				},
				native: {}				
			});

			this.setObjectNotExistsAsync(subpath + '.state', 
			{
				type: 'state',
				common: 
				{
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