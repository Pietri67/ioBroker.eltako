/// <reference path="./types.d.ts" />
const NamespaceLogger = require('./NamespaceLogger');

/**
 * Base class for ioBroker Plugins
 */
class PluginBase {

    /**
     * Constructor for Plugin class
     * This method is called by js-controller/adapter process internally when initializing the plugin.
     *
     * @param {import("@iobroker/plugin-base/types").PluginSettings} settings
     */
    constructor(settings) {
        this.pluginScope = settings.pluginScope;
        this.parentNamespace = settings.parentNamespace;
        this.pluginNamespace = settings.pluginNamespace;
        this.log = new NamespaceLogger(settings.pluginLogNamespace, settings.log);
        this.iobrokerConfig = settings.iobrokerConfig;
        this.parentPackage = settings.parentPackage || {};
        this.settings = settings;

        this.objectsDb = null;
        this.statesDb = null;

        this.isActive = false;

        this.SCOPES = {
            'ADAPTER': 'adapter',
            'CONTROLLER': 'controller'
        };
    }

    /**
     * Method for Plugin developer to initialize his Plugin
     *
     * @param {Record<string, any>} pluginConfig plugin configuration from config files
     * @return {Promise<void>} resolves if init was successful else rejects
     */
    init(pluginConfig) {
        // Implement in your Plugin instance if needed
        return Promise.reject(new Error('Not implemented'));
    }

    /**
     * Method which is called on a clean end of the process to pot. clean up used resources
     *
     * @return {boolean} The return value indicates if the exit was successful. If no action needs to be taken, you should return true.
     */
    destroy() {
        // Implement in your Plugin instance if needed
        return true;
    }

    /**
     * Get a State from State DB
     *
     * @param {string} id id of the state to retrieve
     * @return {ReturnType<ioBroker.Adapter["getStateAsync"]>} Promise with error or result
     */
    getState(id) {
        if (!this.statesDb) {
            return Promise.reject(new Error('States Database not initialized.'));
        }
        return this.statesDb.getStateAsync(id);
    }

    /**
     * Set a State in State DB
     *
     * @param {string} id id of the state to set
     * @param {Partial<ioBroker.State>} state state value to set
     * @return {Promise<ioBroker.State | null | undefined>} Promise with error or result
     */
    setState(id, state) {
        if (!this.statesDb) {
            return Promise.reject(new Error('States Database not initialized.'));
        }
        return this.statesDb.setStateAsync(id, state);
    }

    /**
     * Get an Object from Objects DB
     *
     * @param {string} id id of the object to retrieve
     * @return {Promise<ioBroker.Object | null | undefined>} Promise with result or error
     */
    getObject(id) {
        if (!this.objectsDb) {
            return Promise.reject(new Error('Objects Database not initialized.'));
        }
        return this.objectsDb.getObjectAsync(id);
    }

    /**
     * Set an Object in Objects DB
     *
     * @param {string} id id of the object to set
     * @param {ioBroker.Object} obj object to set
     * @return {ReturnType<ioBroker.Adapter["setObjectAsync"]>} Promise with error or result
     */
    setObject(id, obj) {
        if (!this.objectsDb) {
            return Promise.reject(new Error('Objects Database not initialized.'));
        }
        return this.objectsDb.setObjectAsync(id, obj);
    }

    /**
     * Set/Extend an Object in Objects DB
     *
     * @param {string} id id of the object to set/extend
     * @param {object} obj object to set
     * @return {ReturnType<ioBroker.Adapter["extendObjectAsync"]>} Promise with result or error
     */
    extendObject(id, obj) {
        if (!this.objectsDb) {
            return Promise.reject(new Error('Objects Database not initialized.'));
        }
        return this.objectsDb.extendObjectAsync(id, obj);
    }

    /****************************************
     * Internal methods!!
     ****************************************/

    /**
     * @internal
     * Set the Active flag for the plugin
     *
     * @param {boolean} active true/false if active
     */
    async setActive(active) {
        this.isActive = !!active;
        await this.setState(this.pluginNamespace + '.enabled', {
            val: !!active,
            ack: true,
            from: this.pluginNamespace
        });
    }

    /**
     * @internal
     * Set the objects and states database to be used internally
     * This method is called by js-controller/adapter process internally when initializing the plugin.
     *
     * @param {any} objectsDb objects DB instance
     * @param {any} statesDb states DB instance
     */
    setDatabase(objectsDb, statesDb) {
        this.objectsDb = objectsDb;
        this.statesDb = statesDb;
    }

    /**
     * @internal
     * Initialize plugin, internal method
     *
     * @param {Record<string, any>} pluginConfig plugin configuration from config files
     * @param {Record<string, any>} parentConfig io-package from parent module where plugin is used in
     */
    async initPlugin(pluginConfig, parentConfig) {
        if (!pluginConfig) {
            throw new Error('No configuration for plugin');
        }
        this.parentIoPackage = parentConfig;

        let pluginEnabledState;
        try {
            await this.extendObject(this.pluginNamespace, {
                type:      'folder',
                common: {
                    name:  'Plugin States',
                },
                native: {}
            });
            await this.extendObject(`${this.pluginNamespace}.enabled`, {
                type:      'state',
                common: {
                    name:  'Plugin - enabled',
                    type:  'boolean',
                    read:  true,
                    write: true,
                    role:  'value'
                },
                native: {}
            });

            pluginEnabledState = await this.getState(`${this.pluginNamespace}.enabled`);
        } catch {
            // ignore
        }
        if (pluginEnabledState && typeof pluginEnabledState.val !== 'object' && pluginEnabledState.val !== undefined) {
            // We already have a enabled flag state, use it
            return this._initialize(pluginConfig, !!pluginEnabledState.val);
        }

        // We have first start and no enabled flag is set
        if (this.pluginScope === this.SCOPES.ADAPTER && parentConfig && parentConfig.common && parentConfig.common.host) {
            // We check if the host has a sentry enabled flag
            const hostNamespace = this.pluginNamespace.replace(new RegExp('system\.adapter\.' + parentConfig.common.name + '\.[0-9]+\.'), 'system.host.' + parentConfig.common.host + '.');

            let hostState;
            try {
                hostState = await this.getState(`${hostNamespace}.enabled`);
            } catch {
                // ignore
            }
            if (hostState && typeof hostState.val !== 'object' && hostState.val !== undefined) {
                // We simply use the host enabled flag state
                return this._initialize(pluginConfig, !!hostState.val);
            }
        }

        this._initialize(pluginConfig, pluginConfig.enabled === undefined ? true : !!pluginConfig.enabled);
    }

    /**
     * @internal
     * @param {Record<string, any>} pluginConfig
     * @param {string | boolean} activate
     */
    async _initialize(pluginConfig, activate) {
        if (activate) {
            this.log.debug(`Initialize Plugin (enabled=${activate})`);
            pluginConfig.enabled = activate;
            try {
                await this.init(pluginConfig);
                await this.setActive(true);
            } catch (e) {
                await this.setActive(false);
            }
        } else {
            this.log.debug(`Do not initialize Plugin (enabled=${activate})`);
            await this.setActive(false);
        }
    }
}

module.exports = PluginBase;