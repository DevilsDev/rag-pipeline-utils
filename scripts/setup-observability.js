#!/usr/bin/env node

/**
 * @fileoverview Setup script for observability infrastructure.
 * Configures Prometheus, Grafana, and OpenTelemetry for comprehensive monitoring.
 *
 * @author DevilsDev Team
 * @since 2.1.0
 * @version 2.1.0
 */

const fs = require("fs").promises;
const path = require("path");
const { spawn } = require("child_process");
const logger = require("../src/utils/structured-logger");

/**
 * Observability setup manager for automated infrastructure configuration.
 *
 * @class ObservabilitySetup
 */
class ObservabilitySetup {
  constructor(options = {}) {
    this.config = {
      // Prometheus Configuration
      prometheus: {
        enabled: options.prometheus?.enabled !== false,
        port: options.prometheus?.port || 9090,
        configFile: options.prometheus?.configFile || "prometheus.yml",
        dataDir:
          options.prometheus?.dataDir || "./observability/prometheus-data",
        retention: options.prometheus?.retention || "30d",
        ...options.prometheus,
      },

      // Grafana Configuration
      grafana: {
        enabled: options.grafana?.enabled !== false,
        port: options.grafana?.port || 3000,
        dataDir: options.grafana?.dataDir || "./observability/grafana-data",
        dashboardDir:
          options.grafana?.dashboardDir || "./observability/dashboards",
        adminUser: options.grafana?.adminUser || "admin",
        adminPassword: options.grafana?.adminPassword || "admin",
        ...options.grafana,
      },

      // Jaeger Configuration
      jaeger: {
        enabled: options.jaeger?.enabled !== false,
        port: options.jaeger?.port || 16686,
        collectorPort: options.jaeger?.collectorPort || 14268,
        dataDir: options.jaeger?.dataDir || "./observability/jaeger-data",
        ...options.jaeger,
      },

      // OpenTelemetry Configuration
      otel: {
        enabled: options.otel?.enabled !== false,
        endpoint: options.otel?.endpoint || "http://localhost:4318",
        serviceName:
          options.otel?.serviceName || "@devilsdev/rag-pipeline-utils",
        ...options.otel,
      },

      // Setup Configuration
      setup: {
        outputDir: options.setup?.outputDir || "./observability",
        createDockerCompose: options.setup?.createDockerCompose !== false,
        createSystemdServices: options.setup?.createSystemdServices !== false,
        installDependencies: options.setup?.installDependencies !== false,
        ...options.setup,
      },

      ...options,
    };

    this.dockerServices = [];
    this.systemdServices = [];
  }

  /**
   * Run the complete observability setup.
   *
   * @returns {Promise<void>} Setup promise
   */
  async setup() {
    try {
      logger.info("Starting observability infrastructure setup", {
        prometheus: this.config.prometheus.enabled,
        grafana: this.config.grafana.enabled,
        jaeger: this.config.jaeger.enabled,
        otel: this.config.otel.enabled,
      });

      // Create output directories
      await this.createDirectories();

      // Setup Prometheus
      if (this.config.prometheus.enabled) {
        await this.setupPrometheus();
      }

      // Setup Grafana
      if (this.config.grafana.enabled) {
        await this.setupGrafana();
      }

      // Setup Jaeger
      if (this.config.jaeger.enabled) {
        await this.setupJaeger();
      }

      // Setup OpenTelemetry
      if (this.config.otel.enabled) {
        await this.setupOpenTelemetry();
      }

      // Create Docker Compose file
      if (this.config.setup.createDockerCompose) {
        await this.createDockerCompose();
      }

      // Create systemd services
      if (this.config.setup.createSystemdServices) {
        await this.createSystemdServices();
      }

      // Create startup scripts
      await this.createStartupScripts();

      // Install dependencies
      if (this.config.setup.installDependencies) {
        await this.installDependencies();
      }

      logger.info("Observability infrastructure setup completed successfully", {
        outputDir: this.config.setup.outputDir,
        services: this.dockerServices.length,
      });

      await this.printSetupInstructions();
    } catch (error) {
      logger.error("Failed to setup observability infrastructure", {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Create necessary directories for observability.
   *
   * @private
   */
  async createDirectories() {
    const dirs = [
      this.config.setup.outputDir,
      this.config.prometheus.dataDir,
      this.config.grafana.dataDir,
      this.config.grafana.dashboardDir,
      this.config.jaeger.dataDir,
      path.join(this.config.setup.outputDir, "config"),
      path.join(this.config.setup.outputDir, "scripts"),
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
      logger.debug("Created directory", { dir });
    }
  }

  /**
   * Setup Prometheus monitoring.
   *
   * @private
   */
  async setupPrometheus() {
    logger.info("Setting up Prometheus");

    const configPath = path.join(
      this.config.setup.outputDir,
      "config",
      this.config.prometheus.configFile,
    );

    const prometheusConfig = {
      global: {
        scrape_interval: "15s",
        evaluation_interval: "15s",
      },
      rule_files: ["alert_rules.yml"],
      scrape_configs: [
        {
          job_name: "rag-pipeline",
          static_configs: [
            {
              targets: ["localhost:9090"],
            },
          ],
          metrics_path: "/metrics",
          scrape_interval: "10s",
        },
        {
          job_name: "node-exporter",
          static_configs: [
            {
              targets: ["localhost:9100"],
            },
          ],
        },
        {
          job_name: "prometheus",
          static_configs: [
            {
              targets: ["localhost:9090"],
            },
          ],
        },
      ],
      alerting: {
        alertmanagers: [
          {
            static_configs: [
              {
                targets: ["localhost:9093"],
              },
            ],
          },
        ],
      },
    };

    await fs.writeFile(
      configPath,
      `# Prometheus configuration for RAG Pipeline Utils\n${this.yamlStringify(prometheusConfig)}`,
    );

    // Create alert rules
    await this.createAlertRules();

    this.dockerServices.push({
      name: "prometheus",
      image: "prom/prometheus:latest",
      ports: [`${this.config.prometheus.port}:9090`],
      volumes: [
        `./config/${this.config.prometheus.configFile}:/etc/prometheus/prometheus.yml`,
        `./config/alert_rules.yml:/etc/prometheus/alert_rules.yml`,
        `${this.config.prometheus.dataDir}:/prometheus`,
      ],
      command: [
        "--config.file=/etc/prometheus/prometheus.yml",
        "--storage.tsdb.path=/prometheus",
        "--web.console.libraries=/etc/prometheus/console_libraries",
        "--web.console.templates=/etc/prometheus/consoles",
        "--storage.tsdb.retention.time=" + this.config.prometheus.retention,
        "--web.enable-lifecycle",
      ],
    });

    logger.info("Prometheus setup completed", { configPath });
  }

  /**
   * Setup Grafana dashboards.
   *
   * @private
   */
  async setupGrafana() {
    logger.info("Setting up Grafana");

    // Load dashboard configuration
    const dashboardConfigPath = path.join(
      __dirname,
      "..",
      "src",
      "observability",
      "dashboard-config.json",
    );
    const dashboardConfig = JSON.parse(
      await fs.readFile(dashboardConfigPath, "utf8"),
    );

    // Create individual dashboard files
    for (const dashboard of dashboardConfig.dashboards) {
      const dashboardPath = path.join(
        this.config.grafana.dashboardDir,
        `${dashboard.id}.json`,
      );

      const grafanaDashboard = {
        dashboard: {
          id: null,
          title: dashboard.title,
          description: dashboard.description,
          tags: dashboard.tags,
          timezone: "browser",
          panels: dashboard.panels,
          time: {
            from: "now-1h",
            to: "now",
          },
          timepicker: {},
          templating: {
            list: [],
          },
          refresh: dashboard.refresh,
          schemaVersion: 30,
          version: 1,
          links: [],
        },
        overwrite: true,
      };

      await fs.writeFile(
        dashboardPath,
        JSON.stringify(grafanaDashboard, null, 2),
      );
      logger.debug("Created Grafana dashboard", {
        dashboard: dashboard.id,
        path: dashboardPath,
      });
    }

    // Create datasource configuration
    const datasourcePath = path.join(
      this.config.setup.outputDir,
      "config",
      "datasource.yml",
    );
    const datasourceConfig = {
      apiVersion: 1,
      datasources: [
        {
          name: "Prometheus",
          type: "prometheus",
          access: "proxy",
          url: `http://prometheus:${this.config.prometheus.port}`,
          isDefault: true,
        },
      ],
    };

    await fs.writeFile(datasourcePath, this.yamlStringify(datasourceConfig));

    // Create dashboard provisioning config
    const provisioningPath = path.join(
      this.config.setup.outputDir,
      "config",
      "dashboard-provisioning.yml",
    );
    const provisioningConfig = {
      apiVersion: 1,
      providers: [
        {
          name: "rag-pipeline-dashboards",
          orgId: 1,
          folder: "",
          type: "file",
          disableDeletion: false,
          updateIntervalSeconds: 10,
          options: {
            path: "/var/lib/grafana/dashboards",
          },
        },
      ],
    };

    await fs.writeFile(
      provisioningPath,
      this.yamlStringify(provisioningConfig),
    );

    this.dockerServices.push({
      name: "grafana",
      image: "grafana/grafana:latest",
      ports: [`${this.config.grafana.port}:3000`],
      volumes: [
        `${this.config.grafana.dataDir}:/var/lib/grafana`,
        `${this.config.grafana.dashboardDir}:/var/lib/grafana/dashboards`,
        `./config/datasource.yml:/etc/grafana/provisioning/datasources/datasource.yml`,
        `./config/dashboard-provisioning.yml:/etc/grafana/provisioning/dashboards/dashboard-provisioning.yml`,
      ],
      environment: [
        `GF_SECURITY_ADMIN_USER=${this.config.grafana.adminUser}`,
        `GF_SECURITY_ADMIN_PASSWORD=${this.config.grafana.adminPassword}`,
        "GF_INSTALL_PLUGINS=grafana-piechart-panel",
      ],
    });

    logger.info("Grafana setup completed", {
      dashboards: dashboardConfig.dashboards.length,
    });
  }

  /**
   * Setup Jaeger tracing.
   *
   * @private
   */
  async setupJaeger() {
    logger.info("Setting up Jaeger");

    this.dockerServices.push({
      name: "jaeger",
      image: "jaegertracing/all-in-one:latest",
      ports: [
        `${this.config.jaeger.port}:16686`,
        `${this.config.jaeger.collectorPort}:14268`,
        "14250:14250",
      ],
      environment: ["COLLECTOR_OTLP_ENABLED=true"],
      volumes: [`${this.config.jaeger.dataDir}:/tmp`],
    });

    logger.info("Jaeger setup completed");
  }

  /**
   * Setup OpenTelemetry configuration.
   *
   * @private
   */
  async setupOpenTelemetry() {
    logger.info("Setting up OpenTelemetry");

    const otelConfigPath = path.join(
      this.config.setup.outputDir,
      "config",
      "otel-config.yml",
    );
    const otelConfig = {
      receivers: {
        otlp: {
          protocols: {
            grpc: {
              endpoint: "0.0.0.0:4317",
            },
            http: {
              endpoint: "0.0.0.0:4318",
            },
          },
        },
      },
      processors: {
        batch: {},
      },
      exporters: {
        prometheus: {
          endpoint: "0.0.0.0:8889",
        },
        jaeger: {
          endpoint: "jaeger:14250",
          tls: {
            insecure: true,
          },
        },
      },
      service: {
        pipelines: {
          traces: {
            receivers: ["otlp"],
            processors: ["batch"],
            exporters: ["jaeger"],
          },
          metrics: {
            receivers: ["otlp"],
            processors: ["batch"],
            exporters: ["prometheus"],
          },
        },
      },
    };

    await fs.writeFile(otelConfigPath, this.yamlStringify(otelConfig));

    this.dockerServices.push({
      name: "otel-collector",
      image: "otel/opentelemetry-collector:latest",
      command: ["--config=/etc/otel-collector-config.yml"],
      volumes: ["./config/otel-config.yml:/etc/otel-collector-config.yml"],
      ports: ["4317:4317", "4318:4318", "8889:8889"],
      depends_on: ["jaeger"],
    });

    logger.info("OpenTelemetry setup completed");
  }

  /**
   * Create alert rules for Prometheus.
   *
   * @private
   */
  async createAlertRules() {
    const alertRulesPath = path.join(
      this.config.setup.outputDir,
      "config",
      "alert_rules.yml",
    );

    const alertRules = {
      groups: [
        {
          name: "rag-pipeline-alerts",
          rules: [
            {
              alert: "ServiceDown",
              expr: 'up{job="rag-pipeline"} == 0',
              for: "1m",
              labels: {
                severity: "critical",
                service: "rag-pipeline",
              },
              annotations: {
                summary: "RAG Pipeline service is down",
                description:
                  "The RAG Pipeline service has been down for more than 1 minute.",
              },
            },
            {
              alert: "HighErrorRate",
              expr: "rate(rag_errors_total[5m]) / rate(rag_requests_total[5m]) * 100 > 5",
              for: "5m",
              labels: {
                severity: "warning",
                service: "rag-pipeline",
              },
              annotations: {
                summary: "High error rate detected",
                description: "Error rate is above 5% for more than 5 minutes.",
              },
            },
            {
              alert: "SecurityViolation",
              expr: "rate(plugin_sandbox_violations[5m]) > 0",
              for: "0m",
              labels: {
                severity: "critical",
                service: "security",
              },
              annotations: {
                summary: "Security violation detected",
                description: "Plugin sandbox security violation detected.",
              },
            },
          ],
        },
      ],
    };

    await fs.writeFile(alertRulesPath, this.yamlStringify(alertRules));
    logger.debug("Created alert rules", { path: alertRulesPath });
  }

  /**
   * Create Docker Compose file for all services.
   *
   * @private
   */
  async createDockerCompose() {
    logger.info("Creating Docker Compose configuration");

    const dockerCompose = {
      version: "3.8",
      services: {},
      volumes: {},
      networks: {
        observability: {
          driver: "bridge",
        },
      },
    };

    // Add services
    for (const service of this.dockerServices) {
      dockerCompose.services[service.name] = {
        image: service.image,
        container_name: service.name,
        ports: service.ports || [],
        volumes: service.volumes || [],
        environment: service.environment || [],
        command: service.command || undefined,
        depends_on: service.depends_on || undefined,
        networks: ["observability"],
        restart: "unless-stopped",
      };

      // Clean up undefined values
      Object.keys(dockerCompose.services[service.name]).forEach((key) => {
        if (dockerCompose.services[service.name][key] === undefined) {
          delete dockerCompose.services[service.name][key];
        }
      });
    }

    const dockerComposePath = path.join(
      this.config.setup.outputDir,
      "docker-compose.yml",
    );
    await fs.writeFile(dockerComposePath, this.yamlStringify(dockerCompose));

    logger.info("Docker Compose configuration created", {
      path: dockerComposePath,
    });
  }

  /**
   * Create startup scripts.
   *
   * @private
   */
  async createStartupScripts() {
    logger.info("Creating startup scripts");

    // Create start script
    const startScript = `#!/bin/bash
# Start observability infrastructure

echo "Starting RAG Pipeline observability infrastructure..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker first."
    exit 1
fi

# Start services
docker-compose up -d

echo "Waiting for services to be ready..."
sleep 10

# Check service health
echo "Checking service health..."
services=(prometheus grafana jaeger otel-collector)

for service in "\${services[@]}"; do
    if docker-compose ps \$service | grep -q "Up"; then
        echo "✓ \$service is running"
    else
        echo "✗ \$service failed to start"
    fi
done

echo ""
echo "Observability infrastructure started successfully!"
echo "Access URLs:"
echo "  Grafana:    http://localhost:${this.config.grafana.port}"
echo "  Prometheus: http://localhost:${this.config.prometheus.port}"
echo "  Jaeger:     http://localhost:${this.config.jaeger.port}"
echo ""
echo "Default Grafana credentials: ${this.config.grafana.adminUser}/${this.config.grafana.adminPassword}"
`;

    const startScriptPath = path.join(
      this.config.setup.outputDir,
      "scripts",
      "start.sh",
    );
    await fs.writeFile(startScriptPath, startScript);
    await fs.chmod(startScriptPath, "755");

    // Create stop script
    const stopScript = `#!/bin/bash
# Stop observability infrastructure

echo "Stopping RAG Pipeline observability infrastructure..."
docker-compose down

echo "Observability infrastructure stopped."
`;

    const stopScriptPath = path.join(
      this.config.setup.outputDir,
      "scripts",
      "stop.sh",
    );
    await fs.writeFile(stopScriptPath, stopScript);
    await fs.chmod(stopScriptPath, "755");

    logger.info("Startup scripts created", {
      start: startScriptPath,
      stop: stopScriptPath,
    });
  }

  /**
   * Install required dependencies.
   *
   * @private
   */
  async installDependencies() {
    logger.info("Installing OpenTelemetry dependencies");

    const dependencies = [
      "@opentelemetry/auto-instrumentations-node",
      "@opentelemetry/exporter-jaeger",
      "@opentelemetry/exporter-prometheus",
      "@opentelemetry/sdk-node",
      "@opentelemetry/api",
    ];

    for (const dep of dependencies) {
      await this.runCommand("npm", ["install", dep]);
    }

    logger.info("Dependencies installed successfully");
  }

  /**
   * Print setup instructions.
   *
   * @private
   */
  async printSetupInstructions() {
    const instructions = `
🎉 Observability Infrastructure Setup Complete!

📁 Files created in: ${this.config.setup.outputDir}

🚀 To start the observability stack:
   cd ${this.config.setup.outputDir}
   ./scripts/start.sh

🛑 To stop the observability stack:
   ./scripts/stop.sh

🌐 Access URLs:
   Grafana:    http://localhost:${this.config.grafana.port}
   Prometheus: http://localhost:${this.config.prometheus.port}
   Jaeger:     http://localhost:${this.config.jaeger.port}

🔐 Default Grafana credentials:
   Username: ${this.config.grafana.adminUser}
   Password: ${this.config.grafana.adminPassword}

📊 Pre-configured dashboards:
   - RAG Pipeline Overview
   - DAG Engine Performance
   - Security Monitoring
   - Plugin Performance
   - RAG Quality Metrics
   - System Resources

⚠️  Prerequisites:
   - Docker and Docker Compose must be installed
   - Ports ${this.config.prometheus.port}, ${this.config.grafana.port}, ${this.config.jaeger.port} should be available

📖 For more information, see the observability documentation.
`;

    console.log(instructions); // eslint-disable-line no-console
    logger.info("Setup instructions displayed");
  }

  /**
   * Simple YAML stringifier.
   *
   * @private
   * @param {Object} obj - Object to stringify
   * @returns {string} YAML string
   */
  yamlStringify(obj) {
    return JSON.stringify(obj, null, 2)
      .replace(/"/g, "")
      .replace(/:/g, ": ")
      .replace(/,/g, "")
      .replace(/\[/g, "\n  - ")
      .replace(/\]/g, "")
      .replace(/{/g, "")
      .replace(/}/g, "");
  }

  /**
   * Run a command with promise interface.
   *
   * @private
   * @param {string} command - Command to run
   * @param {string[]} args - Command arguments
   * @returns {Promise<void>} Command promise
   */
  runCommand(command, args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, { stdio: "inherit" });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `Command failed with code ${code}: ${command} ${args.join(" ")}`,
            ),
          );
        }
      });

      proc.on("error", reject);
    });
  }
}

// Main execution
if (require.main === module) {
  const setup = new ObservabilitySetup();

  setup
    .setup()
    .then(() => {
      logger.info("Observability setup completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("Setup failed", { error: error.message });
      process.exit(1);
    });
}

module.exports = { ObservabilitySetup };
module.exports.default = module.exports;
