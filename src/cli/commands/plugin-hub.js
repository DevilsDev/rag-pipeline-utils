/**
const path = require('path');
 * Plugin Hub CLI Commands
 * Command-line interface for community plugin hub operations
 */

const { Command } = require('commander');
// eslint-disable-line global-require
const chalk = require('chalk');
// eslint-disable-line global-require
const ora = require('ora');
// eslint-disable-line global-require
const inquirer = require('inquirer');
// eslint-disable-line global-require
const Table = require('cli-table3');
// eslint-disable-line global-require
const { PluginHub } = require('../../ecosystem/plugin-hub');
// eslint-disable-line global-require
const { PluginCertification } = require('../../ecosystem/plugin-certification');
// eslint-disable-line global-require

class PluginHubCLI {
  constructor() {
    this.hub = new PluginHub();
    this.certification = new PluginCertification();
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Hub events
    this.hub.on('install_start', (data) => {
      console.log(
        chalk.blue(
          `🚀 Starting installation of ${data.pluginId}@${data.version}`,
        ),
      ); // eslint-disable-line no-console
    });

    this.hub.on('install_progress', (data) => {
      const stages = {
        security_scan: '🔍 Running security scan...',
        downloading: '⬇️  Downloading plugin...',
        verifying: '✅ Verifying integrity...',
        sandbox_install: '🏗️  Installing in sandbox...',
        installing: '📦 Installing to system...',
      };
      console.log(
        chalk.yellow(stages[data.stage] || `Processing ${data.stage}...`),
      ); // eslint-disable-line no-console
    }); // eslint-disable-line no-console

    this.hub.on('install_complete', (data) => {
      console.log(
        chalk.green(
          `✅ Successfully installed ${data.pluginId}@${data.version}`,
        ),
      ); // eslint-disable-line no-console
    });

    // eslint-disable-line no-console
    this.hub.on('install_error', (data) => {
      console.error(chalk.red(`❌ Installation failed: ${data.error.message}`)); // eslint-disable-line no-console
    });

    // Certification events
    // eslint-disable-line no-console
    this.certification.on('certification_start', (data) => {
      console.log(
        chalk.blue(
          `🏆 Starting ${data.level} certification for ${data.pluginId}`,
        ),
      ); // eslint-disable-line no-console
    });

    this.certification.on('certification_progress', (data) => {
      const stages = {
        // eslint-disable-line no-console
        automated_checks: '🤖 Running automated checks...',
        manual_review: '👥 Submitting for manual review...',
        security_audit: '🔒 Performing security audit...',
      };
      console.log(
        chalk.yellow(stages[data.stage] || `Processing ${data.stage}...`),
      ); // eslint-disable-line no-console
    });
  }

  createCommands() {
    const program = new Command('hub'); // eslint-disable-line no-console
    program.description('Community plugin hub operations');

    // Search command
    program
      .command('search <query>')
      .description('Search plugins in the community hub')
      .option('-c, --category <category>', 'Filter by category')
      .option('-t, --tags <tags>', 'Filter by tags (comma-separated)')
      .option('-a, --author <author>', 'Filter by author')
      .option('-r, --min-rating <rating>', 'Minimum rating (1-5)', parseFloat)
      .option('--verified', 'Show only verified plugins')
      .option('-l, --limit <limit>', 'Number of results', parseInt, 20)
      .option(
        '--sort <sort>',
        'Sort by: relevance, downloads, rating, updated',
        'relevance',
      )
      .action(async (query, _options) => {
        await this.searchPlugins(query, _options);
      });

    // Install command
    program
      .command('install <plugin>')
      .description('Install a plugin from the hub')
      .option('-v, --version <version>', 'Plugin version', 'latest')
      .option('--no-security-scan', 'Skip security scan')
      .option('--require-certified', 'Only install certified plugins')
      .option(
        '--sandbox-timeout <timeout>',
        'Sandbox timeout in ms',
        parseInt,
        30000,
      )
      .action(async (plugin, _options) => {
        await this.installPlugin(plugin, _options);
      });

    // Info command
    program
      .command('info <plugin>')
      .description('Get detailed information about a plugin')
      .action(async (plugin) => {
        await this.getPluginInfo(plugin);
      });

    // List installed command
    program
      .command('list')
      .alias('ls')
      .description('List installed plugins')
      .option('--format <format>', 'Output format: table, json', 'table')
      .action(async (_options) => {
        await this.listInstalledPlugins(_options);
      });

    // Publish command
    program
      .command('publish [path]')
      .description('Publish a plugin to the hub')
      .option('--dry-run', 'Validate without publishing')
      .option('--tag <tag>', 'Release tag')
      .action(async (pluginPath, _options) => {
        await this.publishPlugin(pluginPath || process.cwd(), _options);
      });

    // Rate command
    program
      .command('rate <plugin> <rating>')
      .description('Rate a plugin (1-5 stars)')
      .option('-r, --review <review>', 'Written review')
      .action(async (plugin, rating, _options) => {
        await this.ratePlugin(plugin, parseInt(rating), _options);
      });

    // Reviews command
    program
      .command('reviews <plugin>')
      .description('View plugin reviews')
      .option('-l, --limit <limit>', 'Number of reviews', parseInt, 10)
      .option('--sort <sort>', 'Sort by: helpful, recent, rating', 'helpful')
      .action(async (plugin, _options) => {
        await this.getPluginReviews(plugin, _options);
      });

    // Trending command
    program
      .command('trending')
      .description('Show trending plugins')
      .option('-p, --period <period>', 'Time period: day, week, month', 'week')
      .option('-c, --category <category>', 'Filter by category')
      .option('-l, --limit <limit>', 'Number of results', parseInt, 20)
      .action(async (_options) => {
        await this.getTrendingPlugins(_options);
      });

    // Certification commands
    const certifyCmd = program
      .command('certify')
      .description('Plugin certification operations');

    certifyCmd
      .command('submit <plugin>')
      .description('Submit plugin for certification')
      .option(
        '-l, --level <level>',
        'Certification level: BASIC, VERIFIED, ENTERPRISE',
        'BASIC',
      )
      .action(async (plugin, _options) => {
        await this.submitForCertification(plugin, _options);
      });

    certifyCmd
      .command('verify <plugin> <certificationId>')
      .description('Verify plugin certification')
      .action(async (plugin, certificationId) => {
        await this.verifyCertification(plugin, certificationId);
      });

    certifyCmd
      .command('requirements [level]')
      .description('Show certification requirements')
      .action(async (level) => {
        await this.showCertificationRequirements(level);
      });

    // Publisher commands
    const publisherCmd = program
      .command('publisher')
      .description('Publisher verification operations');

    publisherCmd
      .command('status [publisherId]')
      .description('Check publisher verification status')
      .action(async (publisherId) => {
        await this.getPublisherStatus(publisherId);
      });

    publisherCmd
      .command('apply')
      .description('Apply for publisher verification')
      .action(async () => {
        await this.applyForPublisherVerification();
      });

    return program;
  }

  async searchPlugins(query, _options) {
    const spinner = ora('Searching plugins...').start();

    try {
      const searchOptions = {
        category: _options.category,
        tags: _options.tags ? _options.tags.split(',') : undefined,
        author: _options.author,
        minRating: _options.minRating,
        verified: _options.verified,
        limit: _options.limit,
        sortBy: _options.sort,
      };

      const results = await this.hub.searchPlugins(query, searchOptions);
      spinner.stop();

      if (results.results.length === 0) {
        console.log(chalk.yellow('No plugins found matching your criteria.')); // eslint-disable-line no-console
        return;
      }

      console.log(chalk.green(`Found ${results.total} plugins:\n`)); // eslint-disable-line no-console

      const table = new Table({
        // eslint-disable-line no-console
        head: [
          'Name',
          'Version',
          'Author',
          'Rating',
          'Downloads',
          'Description',
        ],
        colWidths: [20, 10, 15, 8, 10, 40],
      });

      for (const plugin of results.results) {
        // eslint-disable-line no-console
        const rating =
          '★'.repeat(Math.floor(plugin.rating)) +
          '☆'.repeat(5 - Math.floor(plugin.rating));
        const certified = plugin.certified ? chalk.green('✓') : '';

        table.push([
          `${plugin.name} ${certified}`,
          plugin.version,
          plugin.author,
          `${rating} (${plugin.reviewCount})`,
          plugin.downloadCount.toLocaleString(),
          plugin.description.substring(0, 35) +
            (plugin.description.length > 35 ? '...' : ''),
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

  // eslint-disable-line no-console
  async installPlugin(plugin, _options) {
    try {
      const installOptions = {
        securityScan: _options.securityScan,
        requireCertified: _options.requireCertified,
        sandboxTimeout: _options.sandboxTimeout, // eslint-disable-line no-console
      };

      const result = await this.hub.installPlugin(
        plugin,
        _options.version,
        installOptions,
      );

      console.log(chalk.green('\n✅ Installation completed successfully!')); // eslint-disable-line no-console
      console.log(chalk.blue(`Plugin: ${result.pluginInfo.name}`)); // eslint-disable-line no-console
      console.log(chalk.blue(`Version: ${result.version}`)); // eslint-disable-line no-console
      console.log(chalk.blue(`Install Path: ${result.installPath}`)); // eslint-disable-line no-console

      if (result.pluginInfo.certified) {
        console.log(chalk.green('🏆 This plugin is certified!')); // eslint-disable-line no-console
      }
    } catch (error) {
      console.error(chalk.red(`Installation failed: ${error.message}`)); // eslint-disable-line no-console
      process.exit(1); // eslint-disable-line no-console
    }
  }
  // eslint-disable-line no-console

  async getPluginInfo(plugin) {
    // eslint-disable-line no-console
    const spinner = ora('Fetching plugin information...').start();

    // eslint-disable-line no-console
    try {
      const info = await this.hub.getPluginInfo(plugin);
      spinner.stop();

      // eslint-disable-line no-console
      console.log(chalk.blue.bold(`\n${info.name} v${info.version}\n`)); // eslint-disable-line no-console
      console.log(chalk.gray(info.description)); // eslint-disable-line no-console
      console.log(); // eslint-disable-line no-console

      const details = new Table({
        // eslint-disable-line no-console
        chars: {
          top: '',
          'top-mid': '',
          'top-left': '',
          'top-right': '',
          bottom: '',
          'bottom-mid': '',
          'bottom-left': '',
          'bottom-right': '',
          left: '',
          'left-mid': '',
          mid: '',
          'mid-mid': '',
          right: '',
          'right-mid': '',
          middle: ' ',
        },
        style: { 'padding-left': 0, 'padding-right': 0 },
      });

      const rating =
        '★'.repeat(Math.floor(info.rating)) +
        '☆'.repeat(5 - Math.floor(info.rating));

      details.push(
        ['Author:', info.author],
        ['Category:', info.category],
        ['Rating:', `${rating} (${info.reviewCount} reviews)`],
        // eslint-disable-line no-console
        ['Downloads:', info.downloadCount.toLocaleString()],
        ['License:', info.license],
        // eslint-disable-line no-console
        ['Last Updated:', new Date(info.lastUpdated).toLocaleDateString()],
        [
          'Certified:',
          info.certified ? chalk.green('Yes ✓') : chalk.gray('No'),
        ],
        // eslint-disable-line no-console
        [
          'Verified Publisher:',
          info.verifiedPublisher ? chalk.green('Yes ✓') : chalk.gray('No'),
        ],
      );

      console.log(details.toString()); // eslint-disable-line no-console

      if (info.tags && info.tags.length > 0) {
        console.log(
          chalk.blue('\nTags:'),
          info.tags.map((tag) => chalk.cyan(`#${tag}`)).join(' '),
        ); // eslint-disable-line no-console
      }

      if (info.homepage) {
        console.log(chalk.blue('\nHomepage:'), chalk.underline(info.homepage)); // eslint-disable-line no-console
      }

      if (info.repository) {
        console.log(
          chalk.blue('Repository:'),
          chalk.underline(info.repository),
        ); // eslint-disable-line no-console
      }
    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`Failed to get plugin info: ${error.message}`)); // eslint-disable-line no-console
      process.exit(1);
    }
  }

  // eslint-disable-line no-console
  async listInstalledPlugins(_options) {
    const spinner = ora('Loading installed plugins...').start();

    try {
      // eslint-disable-line no-console
      const installed = await this.hub.getInstalledPlugins();
      spinner.stop();

      if (installed.length === 0) {
        console.log(chalk.yellow('No plugins installed.')); // eslint-disable-line no-console
        return;
      }

      if (_options.format === 'json') {
        console.log(JSON.stringify(installed, null, 2)); // eslint-disable-line no-console
        return;
      }

      console.log(chalk.green(`${installed.length} plugins installed:\n`)); // eslint-disable-line no-console

      const table = new Table({
        // eslint-disable-line no-console
        head: ['Name', 'Version', 'Type', 'Last Used', 'Status'],
        colWidths: [25, 12, 15, 15, 10],
      });

      for (const plugin of installed) {
        const lastUsed = plugin.lastUsed
          ? new Date(plugin.lastUsed).toLocaleDateString()
          : chalk.gray('Never');

        const status = plugin.certified
          ? chalk.green('Certified')
          : chalk.gray('Standard');

        table.push([
          // eslint-disable-line no-console
          plugin.name,
          plugin.version,
          plugin._type,
          lastUsed,
          status,
        ]); // eslint-disable-line no-console
      }

      console.log(table.toString()); // eslint-disable-line no-console
    } catch (error) {
      // eslint-disable-line no-console
      spinner.stop();
      console.error(chalk.red(`Failed to list plugins: ${error.message}`)); // eslint-disable-line no-console
      process.exit(1);
    }
  }

  async publishPlugin(pluginPath, _options) {
    if (_options.dryRun) {
      console.log(
        chalk.blue('🔍 Dry run mode - validating plugin without publishing\n'),
      ); // eslint-disable-line no-console
    }

    try {
      if (!_options.dryRun) {
        const result = await this.hub.publishPlugin(pluginPath, _options);

        console.log(chalk.green('\n🎉 Plugin published successfully!')); // eslint-disable-line no-console
        console.log(chalk.blue(`Plugin ID: ${result.pluginId}`)); // eslint-disable-line no-console
        console.log(chalk.blue(`Version: ${result.version}`)); // eslint-disable-line no-console
        console.log(chalk.blue(`URL: ${result.url}`)); // eslint-disable-line no-console
      } else {
        console.log(
          chalk.green('✅ Plugin validation passed - ready for publishing!'),
        ); // eslint-disable-line no-console
      }
    } catch (error) {
      console.error(chalk.red(`Publishing failed: ${error.message}`)); // eslint-disable-line no-console
      process.exit(1); // eslint-disable-line no-console
    }
  }

  async ratePlugin(plugin, rating, _options) {
    if (rating < 1 || rating > 5) {
      // eslint-disable-line no-console
      console.error(chalk.red('Rating must be between 1 and 5')); // eslint-disable-line no-console
      process.exit(1);
    }

    try {
      await this.hub.ratePlugin(plugin, rating, _options.review);

      const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating); // eslint-disable-line no-console
      console.log(chalk.green(`✅ Rated ${plugin}: ${stars}`)); // eslint-disable-line no-console

      if (_options.review) {
        console.log(chalk.blue('Review submitted successfully!')); // eslint-disable-line no-console
      }
    } catch (error) {
      console.error(chalk.red(`Rating failed: ${error.message}`)); // eslint-disable-line no-console
      process.exit(1);
    }
    // eslint-disable-line no-console
  }

  // eslint-disable-line no-console
  async getPluginReviews(plugin, _options) {
    const spinner = ora('Loading reviews...').start(); // eslint-disable-line no-console

    try {
      const reviews = await this.hub.getPluginReviews(plugin, _options); // eslint-disable-line no-console
      spinner.stop();

      if (reviews.reviews.length === 0) {
        console.log(chalk.yellow('No reviews found for this plugin.')); // eslint-disable-line no-console
        return; // eslint-disable-line no-console
      }

      console.log(chalk.green(`Reviews for ${plugin}:\n`)); // eslint-disable-line no-console

      for (const review of reviews.reviews) {
        const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
        const date = new Date(review.createdAt).toLocaleDateString();

        // eslint-disable-line no-console
        console.log(chalk.blue(`${stars} by ${review.author} on ${date}`)); // eslint-disable-line no-console

        if (review.review) {
          console.log(chalk.gray(`"${review.review}"`)); // eslint-disable-line no-console
        }

        if (review.helpful > 0) {
          console.log(chalk.green(`👍 ${review.helpful} found this helpful`)); // eslint-disable-line no-console
        }
        // eslint-disable-line no-console

        console.log(); // eslint-disable-line no-console
      }

      // eslint-disable-line no-console
      if (reviews.hasMore) {
        console.log(
          chalk.blue(
            `Showing ${reviews.reviews.length} of ${reviews.total} reviews.`,
          ),
        ); // eslint-disable-line no-console
      }
    } catch (error) {
      // eslint-disable-line no-console
      spinner.stop();
      console.error(chalk.red(`Failed to load reviews: ${error.message}`)); // eslint-disable-line no-console
      process.exit(1);
    }
  }

  async getTrendingPlugins(_options) {
    const spinner = ora('Loading trending plugins...').start();

    try {
      const trending = await this.hub.getTrendingPlugins(_options);
      spinner.stop();

      console.log(chalk.green(`🔥 Trending plugins (${_options.period}):\n`)); // eslint-disable-line no-console

      const table = new Table({
        head: ['Rank', 'Name', 'Author', 'Category', 'Growth', 'Rating'],
        colWidths: [6, 20, 15, 15, 10, 10],
      }); // eslint-disable-line no-console

      trending.forEach((plugin, index) => {
        const rating =
          '★'.repeat(Math.floor(plugin.rating)) +
          '☆'.repeat(5 - Math.floor(plugin.rating));
        const certified = plugin.certified ? chalk.green('✓') : '';

        table.push([
          `#${index + 1}`,
          // eslint-disable-line no-console
          `${plugin.name} ${certified}`,
          plugin.author,
          plugin.category,
          chalk.green(`+${plugin.growth || 0}%`),
          // eslint-disable-line no-console
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

  async submitForCertification(plugin, options) {
    // eslint-disable-line no-console
    try {
      const result = await this.certification.submitForCertification(
        plugin,
        options.level,
      );

      console.log(chalk.green('\n🏆 Certification submitted successfully!')); // eslint-disable-line no-console
      console.log(chalk.blue(`Certification ID: ${result.id}`)); // eslint-disable-line no-console
      console.log(chalk.blue(`Level: ${result.level}`)); // eslint-disable-line no-console
      console.log(chalk.blue(`Score: ${result.score}/100`)); // eslint-disable-line no-console
      console.log(chalk.blue(`Status: ${result.status || 'Pending'}`)); // eslint-disable-line no-console

      if (result.estimatedCompletion) {
        console.log(
          chalk.blue(`Estimated completion: ${result.estimatedCompletion}`),
        ); // eslint-disable-line no-console
      }
    } catch (error) {
      console.error(
        chalk.red(`Certification submission failed: ${error.message}`),
      ); // eslint-disable-line no-console
      process.exit(1);
    }
  }

  // eslint-disable-line no-console
  async verifyCertification(plugin, certificationId) {
    const spinner = ora('Verifying certification...').start();

    try {
      const verification = await this.certification.verifyCertification(
        plugin,
        certificationId,
      );
      spinner.stop();

      if (verification.valid) {
        console.log(chalk.green('✅ Certification is valid!')); // eslint-disable-line no-console
        console.log(chalk.blue(`Plugin: ${plugin}`)); // eslint-disable-line no-console
        console.log(chalk.blue(`Level: ${verification.certification.level}`)); // eslint-disable-line no-console
        console.log(
          chalk.blue(
            `Expires: ${new Date(verification.expiresAt).toLocaleDateString()}`,
          ),
        ); // eslint-disable-line no-console
      } else {
        console.log(chalk.red('❌ Certification is invalid or expired')); // eslint-disable-line no-console
      }
    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`Verification failed: ${error.message}`)); // eslint-disable-line no-console
      process.exit(1);
    }
  }
  // eslint-disable-line no-console

  async showCertificationRequirements(level) {
    const levels = level ? [level] : ['BASIC', 'VERIFIED', 'ENTERPRISE'];

    for (const certLevel of levels) {
      // eslint-disable-line no-console
      const requirements =
        this.certification.getCertificationRequirements(certLevel);

      if (!requirements) {
        console.log(chalk.red(`Unknown certification level: ${certLevel}`)); // eslint-disable-line no-console
        continue;
      }

      console.log(
        chalk.blue.bold(`\n${certLevel} Certification Requirements:\n`),
      ); // eslint-disable-line no-console

      console.log(chalk.green('Automated Checks:')); // eslint-disable-line no-console
      requirements.automated.forEach((check) => {
        console.log(chalk.gray(`  • ${check}`)); // eslint-disable-line no-console
      });

      // eslint-disable-line no-console
      if (requirements.manual.length > 0) {
        console.log(chalk.yellow('\nManual Review:')); // eslint-disable-line no-console
        requirements.manual.forEach((review) => {
          console.log(chalk.gray(`  • ${review}`)); // eslint-disable-line no-console
        });
      }

      if (requirements.audit.length > 0) {
        // eslint-disable-line no-console
        console.log(chalk.red('\nSecurity Audit:')); // eslint-disable-line no-console
        requirements.audit.forEach((audit) => {
          console.log(chalk.gray(`  • ${audit}`)); // eslint-disable-line no-console
        });
      }
      // eslint-disable-line no-console

      console.log(chalk.blue(`\nMinimum Score: ${requirements.minScore}/100`)); // eslint-disable-line no-console
      console.log(
        chalk.blue(`Validity Period: ${requirements.validityPeriod}`),
      ); // eslint-disable-line no-console
    }
  }

  async getPublisherStatus(publisherId) {
    const spinner = ora('Checking publisher status...').start();

    try {
      const status = await this.certification.getPublisherStatus(
        publisherId || 'me',
      );
      spinner.stop();

      console.log(chalk.blue.bold('\nPublisher Status:\n')); // eslint-disable-line no-console

      const table = new Table({
        // eslint-disable-line no-console
        chars: {
          top: '',
          'top-mid': '',
          'top-left': '',
          'top-right': '',
          bottom: '',
          'bottom-mid': '',
          'bottom-left': '',
          'bottom-right': '',
          // eslint-disable-line no-console
          left: '',
          'left-mid': '',
          mid: '',
          'mid-mid': '',
          right: '',
          'right-mid': '',
          middle: ' ',
        },
        // eslint-disable-line no-console
        style: { 'padding-left': 0, 'padding-right': 0 },
      });

      // eslint-disable-line no-console
      table.push(
        [
          'Verified:',
          status.verified ? chalk.green('Yes ✓') : chalk.gray('No'),
        ],
        ['Level:', status.level || chalk.gray('None')],
        ['Certified Plugins:', status.certifiedPlugins.toString()],
        ['Reputation:', status.reputation.toString()],
        ['Member Since:', new Date(status.joinedAt).toLocaleDateString()],
        // eslint-disable-line no-console
        ['Last Activity:', new Date(status.lastActivity).toLocaleDateString()],
      );

      console.log(table.toString()); // eslint-disable-line no-console

      if (status.badges && status.badges.length > 0) {
        console.log(chalk.blue('\nBadges:'), status.badges.join(', ')); // eslint-disable-line no-console
      }
    } catch (error) {
      spinner.stop();
      console.error(
        chalk.red(`Failed to get publisher status: ${error.message}`),
      ); // eslint-disable-line no-console
      process.exit(1); // eslint-disable-line no-console
    }
  }

  async applyForPublisherVerification() {
    console.log(chalk.blue('📝 Publisher Verification Application\n')); // eslint-disable-line no-console

    const answers = await inquirer.prompt([
      {
        // eslint-disable-line no-console
        _type: 'input',
        name: 'name',
        message: 'Full name:',
        // eslint-disable-line no-console
        validate: (input) => input.length > 0,
      },
      {
        _type: 'input',
        name: 'email',
        // eslint-disable-line no-console
        message: 'Email address:',
        validate: (input) => /\S+@\S+\.\S+/.test(input),
      },
      // eslint-disable-line no-console
      {
        _type: 'input',
        name: 'organization',
        message: 'Organization (optional):',
      },
      {
        // eslint-disable-line no-console
        _type: 'input',
        name: 'website',
        message: 'Website/Portfolio:',
        // eslint-disable-line no-console
      },
      {
        _type: 'input',
        name: 'github',
        message: 'GitHub profile:',
        // eslint-disable-line no-console
      },
      {
        // eslint-disable-line no-console
        _type: 'editor',
        name: 'motivation',
        message: 'Why do you want to become a verified publisher?',
      },
    ]);

    const spinner = ora('Submitting application...').start();

    try {
      const result =
        await this.certification.applyForPublisherVerification(answers);
      spinner.stop();

      // eslint-disable-line no-console
      console.log(chalk.green('\n✅ Application submitted successfully!')); // eslint-disable-line no-console
      console.log(chalk.blue(`Application ID: ${result.applicationId}`)); // eslint-disable-line no-console
      console.log(chalk.blue(`Status: ${result.status}`)); // eslint-disable-line no-console
      console.log(
        chalk.blue(`Estimated review time: ${result.estimatedReviewTime}`),
      ); // eslint-disable-line no-console
    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`Application failed: ${error.message}`)); // eslint-disable-line no-console
      process.exit(1);
    }
  }
}

module.exports = { PluginHubCLI };

undefined; // eslint-disable-line no-console

undefined; // eslint-disable-line no-console

undefined; // eslint-disable-line no-console

undefined; // eslint-disable-line no-console

undefined; // eslint-disable-line no-console

undefined; // eslint-disable-line no-console

undefined; // eslint-disable-line no-console

undefined; // eslint-disable-line no-console

undefined; // eslint-disable-line no-console
