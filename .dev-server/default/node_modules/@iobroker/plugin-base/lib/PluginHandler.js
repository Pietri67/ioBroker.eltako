/// <reference path="./types.d.ts" />
const NamespaceLogger = require('./NamespaceLogger');

/**
 * Base handler for ioBroker Plugins
 */
class PluginHandler {
    /**
     * Constructor for PluginHandler
     *
     * @param {import("@iobroker/plugin-base/types").PluginHandlerSettings} settings
     */
    constructor(settings) {
        this.settings = settings;
        this.log = new NamespaceLogger(this.settings.logNamespace, settings.log);

        /** @type {Record<string, {config: Record<string, any>, instance?: import("./PluginBase") | null}>} */
        this.plugins = {};
    }

    /**
     * Add plugins to the handler, resolve and require the plugin code and create instance
     *
     * @param {Record<string, any>} configs object with keys for plugin names and their configuration
     * @param {string | string[]} resolveDirs Resolve directories for plugins
     */
    addPlugins(configs, resolveDirs) {
        if (!configs) return;
        Object.keys(configs).forEach(plugin => {
            this.instantiatePlugin(plugin, configs[plugin], resolveDirs);
        });
    }

    /**
     * Resole, Require and instantiate Plugins
     *
     * @param {string} name name of the plugin
     * @param {Record<string, any>} config plugin configuration
     * @param {string | string[]} resolveDirsOrDir Resolve directories
     */
    instantiatePlugin(name, config, resolveDirsOrDir) {
        if (this.plugins[name] && this.plugins[name].instance) {
            this.log.info(`Ignore duplicate plugin ${name}`);
            return;
        }

        const resolveDirs = typeof resolveDirsOrDir === 'string' ? [resolveDirsOrDir] : resolveDirsOrDir;

        const pluginPath = require.resolve(`@iobroker/plugin-${name}`, {
            paths: resolveDirs
        });
        if (!pluginPath) {
            this.log.info(`Plugin ${name} could not be resolved`);
            return;
        }

        /** @type {typeof import("./PluginBase")} */
        let ResolvedPlugin;
        try {
            ResolvedPlugin = require(pluginPath);
        } catch (e) {
            this.log.info(`Plugin ${name} could not be required: ${e.message}`);
            return;
        }

        /** @type {import("@iobroker/plugin-base/types").PluginSettings} */
        const pluginSettings = {
            pluginScope: this.settings.scope,
            parentNamespace: this.settings.namespace,
            pluginNamespace: this.settings.namespace + '.plugins.' + name,
            pluginLogNamespace: this.settings.logNamespace + ' Plugin ' + name,
            log: this.settings.log,
            iobrokerConfig: this.settings.iobrokerConfig,
            parentPackage: this.settings.parentPackage, // package.json from "parent" which uses the plugin (adapter/controller)
            controllerVersion: this.settings.controllerVersion
        };
        this.plugins[name] = {
            config: config
        };

        try {
            this.plugins[name].instance = new ResolvedPlugin(pluginSettings);
        } catch (e) {
            this.log.info(`Plugin ${name} could not be initialized: ${e.message}`);
            this.plugins[name].instance = null;
        }
    }

    /**
     * Set Objects and States databases for all isActive plugins
     *
     * @param {string} name name of the plugin
     * @param {any} objectsDb objects DB instance
     * @param {any} statesDb states DB instance
     */
    setDatabaseForPlugin(name, objectsDb, statesDb) {
        const plugin = this.plugins[name];
        plugin && plugin.instance && plugin.instance.setDatabase(objectsDb, statesDb);
    }

    /**
     * Set Objects and States databases for all isActive plugins
     *
     * @param {any} objectsDb objects DB instance
     * @param {any} statesDb states DB instance
     */
    setDatabaseForPlugins(objectsDb, statesDb) {
        Object.keys(this.plugins).forEach(plugin => this.setDatabaseForPlugin(plugin, objectsDb, statesDb));
    }

    /**
     * Initialize one Plugins
     *
     * @param {string} name name of the plugin
     * @param {Record<string, any>} parentConfig io-package of the parent module that uses the plugins (adapter/controller)
     */
    async initPlugin(name, parentConfig) {
        const instance = this.plugins[name].instance;
        if (!instance) {
            throw new Error('Please instantiate plugin first!');
        }

        try {
             await instance.initPlugin(this.plugins[name].config, parentConfig)
        } catch (e) {
            this.log.debug(`Plugin ${name} destroyed because not initialized correctly`);

            instance.destroy();
            delete this.plugins[name].instance;
        }
    }

    /**
     * Initialize all Plugins that are registered
     *
     * @param {Record<string, any>} parentConfig io-package of the parent module that uses the plugins (adapter/controller)
     */
    async initPlugins(parentConfig) {
        for (const [pluginName, plugin] of Object.entries(this.plugins)) {
            if (!plugin.instance) return;
            await this.initPlugin(pluginName, parentConfig);
        }
    }

    /**
     * Destroy one plugin instance
     *
     * @param {string} name name of the plugin to destroy
     * @param {boolean} [force] true to consider plugin as destroyed also if false is returned from plugin
     */
    destroy(name, force) {
        const instance = this.plugins[name].instance;
        if (instance) {
            if (instance.destroy() || force) {
                this.log.debug('Plugin ' + name + ' destroyed');
                !force && instance.setActive(false);
                delete this.plugins[name].instance;
                return true;
            } else {
                this.log.info('Plugin ' + name + ' could not be destroyed');
                return false;
            }
        }
        return true;
    }

    /**
     * Destroy all plugin instances
     */
    destroyAll() {
        Object.keys(this.plugins).forEach(plugin => {
            this.destroy(plugin, true);
        });
    }

    /**
     * Return plugin instance
     *
     * @param {string} name name of the plugin to return
     * @returns {import("./PluginBase") | null} plugin instance or null if not existent or not isActive
     */
    getPluginInstance(name) {
        const plugin = this.plugins[name];
        if (!plugin || !plugin.instance) {
            return null;
        }
        return plugin.instance;
    }

    /**
     * Return plugin configuration
     *
     * @param {string} name name of the plugin to return
     * @returns {Record<string, any> | null} plugin configuration or null if not existent or not isActive
     */
    getPluginConfig(name) {
        const plugin = this.plugins[name];
        if (!plugin || !plugin.config) {
            return null;
        }
        return plugin.config;
    }

    /**
     * Return if plugin exists
     *
     * @param {string} name name of the plugin to check
     * @returns {boolean} true/false if plugin was configured somewhere
     */
    pluginExists(name) {
        return !!this.plugins[name];
    }

    /**
     * Return if plugin is isActive
     *
     * @param {string} name name of the plugin to check
     * @returns {boolean} true/false if plugin is successfully isActive
     */
    isPluginInstantiated(name) {
        return !!(this.plugins[name] && this.plugins[name].instance);
    }

    /**
     * Return if plugin is active
     *
     * @param {string} name name of the plugin to check
     * @returns {boolean} true/false if plugin is successfully isActive
     */
    isPluginActive(name) {
        // @ts-ignore Not sure why TS doesn't like this pattern
        return !!(this.plugins[name] && this.plugins[name].instance && this.plugins[name].instance.isActive);
    }
}

module.exports = PluginHandler;