/// <reference path="types.d.ts" />
export = PluginBase;
/**
 * Base class for ioBroker Plugins
 */
declare class PluginBase {
    /**
     * Constructor for Plugin class
     * This method is called by js-controller/adapter process internally when initializing the plugin.
     *
     * @param {import("@iobroker/plugin-base/types").PluginSettings} settings
     */
    constructor(settings: import("@iobroker/plugin-base/types").PluginSettings);
    pluginScope: "adapter" | "controller";
    parentNamespace: string;
    pluginNamespace: string;
    log: NamespaceLogger;
    iobrokerConfig: Record<string, any>;
    parentPackage: Record<string, any>;
    settings: import("@iobroker/plugin-base/types").PluginSettings;
    objectsDb: any;
    statesDb: any;
    isActive: boolean;
    SCOPES: {
        ADAPTER: string;
        CONTROLLER: string;
    };
    /**
     * Method for Plugin developer to initialize his Plugin
     *
     * @param {Record<string, any>} pluginConfig plugin configuration from config files
     * @return {Promise<void>} resolves if init was successful else rejects
     */
    init(pluginConfig: Record<string, any>): Promise<void>;
    /**
     * Method which is called on a clean end of the process to pot. clean up used resources
     *
     * @return {boolean} The return value indicates if the exit was successful. If no action needs to be taken, you should return true.
     */
    destroy(): boolean;
    /**
     * Get a State from State DB
     *
     * @param {string} id id of the state to retrieve
     * @return {ReturnType<ioBroker.Adapter["getStateAsync"]>} Promise with error or result
     */
    getState(id: string): ReturnType<ioBroker.Adapter["getStateAsync"]>;
    /**
     * Set a State in State DB
     *
     * @param {string} id id of the state to set
     * @param {Partial<ioBroker.State>} state state value to set
     * @return {Promise<ioBroker.State | null | undefined>} Promise with error or result
     */
    setState(id: string, state: Partial<ioBroker.State>): Promise<ioBroker.State | null | undefined>;
    /**
     * Get an Object from Objects DB
     *
     * @param {string} id id of the object to retrieve
     * @return {Promise<ioBroker.Object | null | undefined>} Promise with result or error
     */
    getObject(id: string): Promise<ioBroker.Object | null | undefined>;
    /**
     * Set an Object in Objects DB
     *
     * @param {string} id id of the object to set
     * @param {ioBroker.Object} obj object to set
     * @return {ReturnType<ioBroker.Adapter["setObjectAsync"]>} Promise with error or result
     */
    setObject(id: string, obj: ioBroker.Object): ReturnType<ioBroker.Adapter["setObjectAsync"]>;
    /**
     * Set/Extend an Object in Objects DB
     *
     * @param {string} id id of the object to set/extend
     * @param {object} obj object to set
     * @return {ReturnType<ioBroker.Adapter["extendObjectAsync"]>} Promise with result or error
     */
    extendObject(id: string, obj: object): ReturnType<ioBroker.Adapter["extendObjectAsync"]>;
    /****************************************
     * Internal methods!!
     ****************************************/
    /**
     * @internal
     * Set the Active flag for the plugin
     *
     * @param {boolean} active true/false if active
     */
    setActive(active: boolean): Promise<void>;
    /**
     * @internal
     * Set the objects and states database to be used internally
     * This method is called by js-controller/adapter process internally when initializing the plugin.
     *
     * @param {any} objectsDb objects DB instance
     * @param {any} statesDb states DB instance
     */
    setDatabase(objectsDb: any, statesDb: any): void;
    /**
     * @internal
     * Initialize plugin, internal method
     *
     * @param {Record<string, any>} pluginConfig plugin configuration from config files
     * @param {Record<string, any>} parentConfig io-package from parent module where plugin is used in
     */
    initPlugin(pluginConfig: Record<string, any>, parentConfig: Record<string, any>): Promise<void>;
    parentIoPackage: Record<string, any>;
    /**
     * @internal
     * @param {Record<string, any>} pluginConfig
     * @param {string | boolean} activate
     */
    _initialize(pluginConfig: Record<string, any>, activate: string | boolean): Promise<void>;
}
import NamespaceLogger = require("./NamespaceLogger");
