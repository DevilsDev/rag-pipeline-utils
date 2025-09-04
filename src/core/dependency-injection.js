/**
 * Dependency Injection Container - IoC implementation
 * Addresses architectural anti-pattern: Hard-coded dependencies
 */

const { logger } = require("../utils/logger");

class DependencyContainer {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
    this.factories = new Map();
    this.interfaces = new Map();
  }

  /**
   * Register a service with the container
   */
  register(name, implementation, options = {}) {
    const { singleton = false, factory = false, interfaces = [] } = options;

    if (factory) {
      this.factories.set(name, implementation);
    } else {
      this.services.set(name, { implementation, singleton });
    }

    // Register interface mappings
    interfaces.forEach((interfaceName) => {
      if (!this.interfaces.has(interfaceName)) {
        this.interfaces.set(interfaceName, []);
      }
      this.interfaces.get(interfaceName).push(name);
    });

    logger.debug("Service registered", {
      service: name,
      singleton,
      factory,
      interfaces,
    });

    return this;
  }

  /**
   * Resolve a service from the container
   */
  resolve(name) {
    // Check if it's a factory
    if (this.factories.has(name)) {
      const factory = this.factories.get(name);
      return factory(this);
    }

    // Check if it's a regular service
    if (this.services.has(name)) {
      const { implementation, singleton } = this.services.get(name);

      if (singleton) {
        if (!this.singletons.has(name)) {
          const instance = this._createInstance(implementation);
          this.singletons.set(name, instance);
        }
        return this.singletons.get(name);
      }

      return this._createInstance(implementation);
    }

    // Check if it's an interface
    if (this.interfaces.has(name)) {
      const implementations = this.interfaces.get(name);
      if (implementations.length === 1) {
        return this.resolve(implementations[0]);
      }
      throw new Error(`Multiple implementations found for interface: ${name}`);
    }

    throw new Error(`Service not found: ${name}`);
  }

  /**
   * Resolve all implementations of an interface
   */
  resolveAll(interfaceName) {
    if (!this.interfaces.has(interfaceName)) {
      throw new Error(`Interface not found: ${interfaceName}`);
    }

    const implementations = this.interfaces.get(interfaceName);
    return implementations.map((name) => this.resolve(name));
  }

  /**
   * Check if a service is registered
   */
  has(name) {
    return (
      this.services.has(name) ||
      this.factories.has(name) ||
      this.interfaces.has(name)
    );
  }

  /**
   * Create an instance with dependency injection
   */
  _createInstance(implementation) {
    if (typeof implementation === "function") {
      // Check if it's a class constructor
      if (
        implementation.prototype &&
        implementation.prototype.constructor === implementation
      ) {
        return new implementation(this);
      }
      // It's a factory function
      return implementation(this);
    }

    // It's already an instance
    return implementation;
  }

  /**
   * Clear all registrations (useful for testing)
   */
  clear() {
    this.services.clear();
    this.singletons.clear();
    this.factories.clear();
    this.interfaces.clear();
  }

  /**
   * Get container statistics
   */
  getStats() {
    return {
      services: this.services.size,
      singletons: this.singletons.size,
      factories: this.factories.size,
      interfaces: this.interfaces.size,
      totalRegistrations: this.services.size + this.factories.size,
    };
  }
}

/**
 * Decorator for automatic dependency injection
 */
function injectable(dependencies = []) {
  return function (target) {
    target.$dependencies = dependencies;
    return target;
  };
}

/**
 * Service locator pattern implementation
 */
class ServiceLocator {
  static container = new DependencyContainer();

  static register(name, implementation, options) {
    return this.container.register(name, implementation, options);
  }

  static resolve(name) {
    return this.container.resolve(name);
  }

  static has(name) {
    return this.container.has(name);
  }

  static clear() {
    this.container.clear();
  }
}

/**
 * Configuration-based container setup
 */
class ContainerBuilder {
  constructor() {
    this.container = new DependencyContainer();
  }

  /**
   * Load services from configuration
   */
  loadFromConfig(config) {
    const { services = {} } = config;

    Object.entries(services).forEach(([name, serviceConfig]) => {
      const {
        implementation,
        singleton = false,
        factory = false,
        interfaces = [],
      } = serviceConfig;

      // Resolve implementation from string path
      let impl = implementation;
      if (typeof implementation === "string") {
        impl = require(implementation);
      }

      this.container.register(name, impl, {
        singleton,
        factory,
        interfaces,
      });
    });

    logger.info("Container loaded from configuration", {
      servicesCount: Object.keys(services).length,
    });

    return this.container;
  }

  build() {
    return this.container;
  }
}

// Default container instance
const defaultContainer = new DependencyContainer();

// Register core services
defaultContainer.register("logger", logger, { singleton: true });

module.exports = {
  DependencyContainer,
  ServiceLocator,
  ContainerBuilder,
  injectable,
  defaultContainer,
};
