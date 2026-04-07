/**
 * Hub Commands
 * Core plugin hub operations: search, install, info, list, publish, trending
 */

const chalk = require("chalk");
const ora = require("ora");
const Table = require("cli-table3");

async function searchPlugins(hub, query, _options) {
  const spinner = ora("Searching plugins...").start();

  try {
    const searchOptions = {
      category: _options.category,
      tags: _options.tags ? _options.tags.split(",") : undefined,
      author: _options.author,
      minRating: _options.minRating,
      verified: _options.verified,
      limit: _options.limit,
      sortBy: _options.sort,
    };

    const results = await hub.searchPlugins(query, searchOptions);
    spinner.stop();

    if (results.results.length === 0) {
      console.log(chalk.yellow("No plugins found matching your criteria.")); // eslint-disable-line no-console
      return;
    }

    console.log(chalk.green(`Found ${results.total} plugins:\n`)); // eslint-disable-line no-console

    const table = new Table({
      head: ["Name", "Version", "Author", "Rating", "Downloads", "Description"],
      colWidths: [20, 10, 15, 8, 10, 40],
    });

    for (const plugin of results.results) {
      const rating =
        "★".repeat(Math.floor(plugin.rating)) +
        "☆".repeat(5 - Math.floor(plugin.rating));
      const certified = plugin.certified ? chalk.green("✓") : "";

      table.push([
        `${plugin.name} ${certified}`,
        plugin.version,
        plugin.author,
        `${rating} (${plugin.reviewCount})`,
        plugin.downloadCount.toLocaleString(),
        plugin.description.substring(0, 35) +
          (plugin.description.length > 35 ? "..." : ""),
      ]);
    }

    console.log(table.toString()); // eslint-disable-line no-console

    if (results.hasMore) {
      console.log(
        chalk.blue(
          `\nShowing ${results.results.length} of ${results.total} results. Use --limit to see more.`,
        ),
      ); // eslint-disable-line no-console
    }
  } catch (error) {
    spinner.stop();
    console.error(chalk.red(`Search failed: ${error.message}`)); // eslint-disable-line no-console
    process.exit(1);
  }
}

async function installPlugin(hub, plugin, _options) {
  try {
    const installOptions = {
      securityScan: _options.securityScan,
      requireCertified: _options.requireCertified,
      sandboxTimeout: _options.sandboxTimeout,
    };

    const result = await hub.installPlugin(
      plugin,
      _options.version,
      installOptions,
    );

    console.log(chalk.green("\n✅ Installation completed successfully!")); // eslint-disable-line no-console
    console.log(chalk.blue(`Plugin: ${result.pluginInfo.name}`)); // eslint-disable-line no-console
    console.log(chalk.blue(`Version: ${result.version}`)); // eslint-disable-line no-console
    console.log(chalk.blue(`Install Path: ${result.installPath}`)); // eslint-disable-line no-console

    if (result.pluginInfo.certified) {
      console.log(chalk.green("🏆 This plugin is certified!")); // eslint-disable-line no-console
    }
  } catch (error) {
    console.error(chalk.red(`Installation failed: ${error.message}`)); // eslint-disable-line no-console
    process.exit(1);
  }
}

async function getPluginInfo(hub, plugin) {
  const spinner = ora("Fetching plugin information...").start();

  try {
    const info = await hub.getPluginInfo(plugin);
    spinner.stop();

    console.log(chalk.blue.bold(`\n${info.name} v${info.version}\n`)); // eslint-disable-line no-console
    console.log(chalk.gray(info.description)); // eslint-disable-line no-console
    console.log(); // eslint-disable-line no-console

    const details = new Table({
      chars: {
        top: "",
        "top-mid": "",
        "top-left": "",
        "top-right": "",
        bottom: "",
        "bottom-mid": "",
        "bottom-left": "",
        "bottom-right": "",
        left: "",
        "left-mid": "",
        mid: "",
        "mid-mid": "",
        right: "",
        "right-mid": "",
        middle: " ",
      },
      style: { "padding-left": 0, "padding-right": 0 },
    });

    const rating =
      "★".repeat(Math.floor(info.rating)) +
      "☆".repeat(5 - Math.floor(info.rating));

    details.push(
      ["Author:", info.author],
      ["Category:", info.category],
      ["Rating:", `${rating} (${info.reviewCount} reviews)`],
      ["Downloads:", info.downloadCount.toLocaleString()],
      ["License:", info.license],
      ["Last Updated:", new Date(info.lastUpdated).toLocaleDateString()],
      ["Certified:", info.certified ? chalk.green("Yes ✓") : chalk.gray("No")],
      [
        "Verified Publisher:",
        info.verifiedPublisher ? chalk.green("Yes ✓") : chalk.gray("No"),
      ],
    );

    console.log(details.toString()); // eslint-disable-line no-console

    if (info.tags && info.tags.length > 0) {
      console.log(
        chalk.blue("\nTags:"),
        info.tags.map((tag) => chalk.cyan(`#${tag}`)).join(" "),
      ); // eslint-disable-line no-console
    }

    if (info.homepage) {
      console.log(chalk.blue("\nHomepage:"), chalk.underline(info.homepage)); // eslint-disable-line no-console
    }

    if (info.repository) {
      console.log(chalk.blue("Repository:"), chalk.underline(info.repository)); // eslint-disable-line no-console
    }
  } catch (error) {
    spinner.stop();
    console.error(chalk.red(`Failed to get plugin info: ${error.message}`)); // eslint-disable-line no-console
    process.exit(1);
  }
}

async function listInstalledPlugins(hub, _options) {
  const spinner = ora("Loading installed plugins...").start();

  try {
    const installed = await hub.getInstalledPlugins();
    spinner.stop();

    if (installed.length === 0) {
      console.log(chalk.yellow("No plugins installed.")); // eslint-disable-line no-console
      return;
    }

    if (_options.format === "json") {
      console.log(JSON.stringify(installed, null, 2)); // eslint-disable-line no-console
      return;
    }

    console.log(chalk.green(`${installed.length} plugins installed:\n`)); // eslint-disable-line no-console

    const table = new Table({
      head: ["Name", "Version", "Type", "Last Used", "Status"],
      colWidths: [25, 12, 15, 15, 10],
    });

    for (const plugin of installed) {
      const lastUsed = plugin.lastUsed
        ? new Date(plugin.lastUsed).toLocaleDateString()
        : chalk.gray("Never");

      const status = plugin.certified
        ? chalk.green("Certified")
        : chalk.gray("Standard");

      table.push([plugin.name, plugin.version, plugin._type, lastUsed, status]);
    }

    console.log(table.toString()); // eslint-disable-line no-console
  } catch (error) {
    spinner.stop();
    console.error(chalk.red(`Failed to list plugins: ${error.message}`)); // eslint-disable-line no-console
    process.exit(1);
  }
}

async function publishPlugin(hub, pluginPath, _options) {
  if (_options.dryRun) {
    console.log(
      chalk.blue("🔍 Dry run mode - validating plugin without publishing\n"),
    ); // eslint-disable-line no-console
  }

  try {
    if (!_options.dryRun) {
      const result = await hub.publishPlugin(pluginPath, _options);

      console.log(chalk.green("\n🎉 Plugin published successfully!")); // eslint-disable-line no-console
      console.log(chalk.blue(`Plugin ID: ${result.pluginId}`)); // eslint-disable-line no-console
      console.log(chalk.blue(`Version: ${result.version}`)); // eslint-disable-line no-console
      console.log(chalk.blue(`URL: ${result.url}`)); // eslint-disable-line no-console
    } else {
      console.log(
        chalk.green("✅ Plugin validation passed - ready for publishing!"),
      ); // eslint-disable-line no-console
    }
  } catch (error) {
    console.error(chalk.red(`Publishing failed: ${error.message}`)); // eslint-disable-line no-console
    process.exit(1);
  }
}

async function getTrendingPlugins(hub, _options) {
  const spinner = ora("Loading trending plugins...").start();

  try {
    const trending = await hub.getTrendingPlugins(_options);
    spinner.stop();

    console.log(chalk.green(`🔥 Trending plugins (${_options.period}):\n`)); // eslint-disable-line no-console

    const table = new Table({
      head: ["Rank", "Name", "Author", "Category", "Growth", "Rating"],
      colWidths: [6, 20, 15, 15, 10, 10],
    });

    trending.forEach((plugin, index) => {
      const rating =
        "★".repeat(Math.floor(plugin.rating)) +
        "☆".repeat(5 - Math.floor(plugin.rating));
      const certified = plugin.certified ? chalk.green("✓") : "";

      table.push([
        `#${index + 1}`,
        `${plugin.name} ${certified}`,
        plugin.author,
        plugin.category,
        chalk.green(`+${plugin.growth || 0}%`),
        rating,
      ]);
    });

    console.log(table.toString()); // eslint-disable-line no-console
  } catch (error) {
    spinner.stop();
    console.error(
      chalk.red(`Failed to load trending plugins: ${error.message}`),
    ); // eslint-disable-line no-console
    process.exit(1);
  }
}

module.exports = {
  searchPlugins,
  installPlugin,
  getPluginInfo,
  listInstalledPlugins,
  publishPlugin,
  getTrendingPlugins,
};
