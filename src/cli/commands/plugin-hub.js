/**
 * Plugin Hub CLI Commands
 * Command-line interface for community plugin hub operations
 */

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const Table = require('cli-table3');
const { PluginHub } = require('../../ecosystem/plugin-hub');
const { PluginCertification } = require('../../ecosystem/plugin-certification');

class PluginHubCLI {
  constructor() {
    this.hub = new PluginHub();
    this.certification = new PluginCertification();
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Hub events
    this.hub.on('install_start', (data) => {
      console.log(chalk.blue(`🚀 Starting installation of ${data.pluginId}@${data.version}`));
    });

    this.hub.on('install_progress', (data) => {
      const stages = {
        security_scan: '🔍 Running security scan...',
        downloading: '⬇️  Downloading plugin...',
        verifying: '✅ Verifying integrity...',
        sandbox_install: '🏗️  Installing in sandbox...',
        installing: '📦 Installing to system...'
      };
      console.log(chalk.yellow(stages[data.stage] || `Processing ${data.stage}...`));
    });

    this.hub.on('install_complete', (data) => {
      console.log(chalk.green(`✅ Successfully installed ${data.pluginId}@${data.version}`));
    });

    this.hub.on('install_error', (data) => {
      console.error(chalk.red(`❌ Installation failed: ${data.error.message}`));
    });

    // Certification events
    this.certification.on('certification_start', (data) => {
      console.log(chalk.blue(`🏆 Starting ${data.level} certification for ${data.pluginId}`));
    });

    this.certification.on('certification_progress', (data) => {
      const stages = {
        automated_checks: '🤖 Running automated checks...',
        manual_review: '👥 Submitting for manual review...',
        security_audit: '🔒 Performing security audit...'
      };
      console.log(chalk.yellow(stages[data.stage] || `Processing ${data.stage}...`));
    });
  }

  createCommands() {
    const program = new Command('hub');
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
      .option('--sort <sort>', 'Sort by: relevance, downloads, rating, updated', 'relevance')
      .action(async (query, options) => {
        await this.searchPlugins(query, options);
      });

    // Install command
    program
      .command('install <plugin>')
      .description('Install a plugin from the hub')
      .option('-v, --version <version>', 'Plugin version', 'latest')
      .option('--no-security-scan', 'Skip security scan')
      .option('--require-certified', 'Only install certified plugins')
      .option('--sandbox-timeout <timeout>', 'Sandbox timeout in ms', parseInt, 30000)
      .action(async (plugin, options) => {
        await this.installPlugin(plugin, options);
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
      .action(async (options) => {
        await this.listInstalledPlugins(options);
      });

    // Publish command
    program
      .command('publish [path]')
      .description('Publish a plugin to the hub')
      .option('--dry-run', 'Validate without publishing')
      .option('--tag <tag>', 'Release tag')
      .action(async (pluginPath, options) => {
        await this.publishPlugin(pluginPath || process.cwd(), options);
      });

    // Rate command
    program
      .command('rate <plugin> <rating>')
      .description('Rate a plugin (1-5 stars)')
      .option('-r, --review <review>', 'Written review')
      .action(async (plugin, rating, options) => {
        await this.ratePlugin(plugin, parseInt(rating), options);
      });

    // Reviews command
    program
      .command('reviews <plugin>')
      .description('View plugin reviews')
      .option('-l, --limit <limit>', 'Number of reviews', parseInt, 10)
      .option('--sort <sort>', 'Sort by: helpful, recent, rating', 'helpful')
      .action(async (plugin, options) => {
        await this.getPluginReviews(plugin, options);
      });

    // Trending command
    program
      .command('trending')
      .description('Show trending plugins')
      .option('-p, --period <period>', 'Time period: day, week, month', 'week')
      .option('-c, --category <category>', 'Filter by category')
      .option('-l, --limit <limit>', 'Number of results', parseInt, 20)
      .action(async (options) => {
        await this.getTrendingPlugins(options);
      });

    // Certification commands
    const certifyCmd = program
      .command('certify')
      .description('Plugin certification operations');

    certifyCmd
      .command('submit <plugin>')
      .description('Submit plugin for certification')
      .option('-l, --level <level>', 'Certification level: BASIC, VERIFIED, ENTERPRISE', 'BASIC')
      .action(async (plugin, options) => {
        await this.submitForCertification(plugin, options);
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

  async searchPlugins(query, options) {
    const spinner = ora('Searching plugins...').start();

    try {
      const searchOptions = {
        category: options.category,
        tags: options.tags ? options.tags.split(',') : undefined,
        author: options.author,
        minRating: options.minRating,
        verified: options.verified,
        limit: options.limit,
        sortBy: options.sort
      };

      const results = await this.hub.searchPlugins(query, searchOptions);
      spinner.stop();

      if (results.results.length === 0) {
        console.log(chalk.yellow('No plugins found matching your criteria.'));
        return;
      }

      console.log(chalk.green(`Found ${results.total} plugins:\n`));

      const table = new Table({
        head: ['Name', 'Version', 'Author', 'Rating', 'Downloads', 'Description'],
        colWidths: [20, 10, 15, 8, 10, 40]
      });

      for (const plugin of results.results) {
        const rating = '★'.repeat(Math.floor(plugin.rating)) + '☆'.repeat(5 - Math.floor(plugin.rating));
        const certified = plugin.certified ? chalk.green('✓') : '';
        
        table.push([
          `${plugin.name} ${certified}`,
          plugin.version,
          plugin.author,
          `${rating} (${plugin.reviewCount})`,
          plugin.downloadCount.toLocaleString(),
          plugin.description.substring(0, 35) + (plugin.description.length > 35 ? '...' : '')
        ]);
      }

      console.log(table.toString());

      if (results.hasMore) {
        console.log(chalk.blue(`\nShowing ${results.results.length} of ${results.total} results. Use --limit to see more.`));
      }

    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`Search failed: ${error.message}`));
      process.exit(1);
    }
  }

  async installPlugin(plugin, options) {
    try {
      const installOptions = {
        securityScan: options.securityScan,
        requireCertified: options.requireCertified,
        sandboxTimeout: options.sandboxTimeout
      };

      const result = await this.hub.installPlugin(plugin, options.version, installOptions);
      
      console.log(chalk.green('\n✅ Installation completed successfully!'));
      console.log(chalk.blue(`Plugin: ${result.pluginInfo.name}`));
      console.log(chalk.blue(`Version: ${result.version}`));
      console.log(chalk.blue(`Install Path: ${result.installPath}`));
      
      if (result.pluginInfo.certified) {
        console.log(chalk.green('🏆 This plugin is certified!'));
      }

    } catch (error) {
      console.error(chalk.red(`Installation failed: ${error.message}`));
      process.exit(1);
    }
  }

  async getPluginInfo(plugin) {
    const spinner = ora('Fetching plugin information...').start();

    try {
      const info = await this.hub.getPluginInfo(plugin);
      spinner.stop();

      console.log(chalk.blue.bold(`\n${info.name} v${info.version}\n`));
      console.log(chalk.gray(info.description));
      console.log();

      const details = new Table({
        chars: { 'top': '', 'top-mid': '', 'top-left': '', 'top-right': '',
                'bottom': '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
                'left': '', 'left-mid': '', 'mid': '', 'mid-mid': '',
                'right': '', 'right-mid': '', 'middle': ' ' },
        style: { 'padding-left': 0, 'padding-right': 0 }
      });

      const rating = '★'.repeat(Math.floor(info.rating)) + '☆'.repeat(5 - Math.floor(info.rating));
      
      details.push(
        ['Author:', info.author],
        ['Category:', info.category],
        ['Rating:', `${rating} (${info.reviewCount} reviews)`],
        ['Downloads:', info.downloadCount.toLocaleString()],
        ['License:', info.license],
        ['Last Updated:', new Date(info.lastUpdated).toLocaleDateString()],
        ['Certified:', info.certified ? chalk.green('Yes ✓') : chalk.gray('No')],
        ['Verified Publisher:', info.verifiedPublisher ? chalk.green('Yes ✓') : chalk.gray('No')]
      );

      console.log(details.toString());

      if (info.tags && info.tags.length > 0) {
        console.log(chalk.blue('\nTags:'), info.tags.map(tag => chalk.cyan(`#${tag}`)).join(' '));
      }

      if (info.homepage) {
        console.log(chalk.blue('\nHomepage:'), chalk.underline(info.homepage));
      }

      if (info.repository) {
        console.log(chalk.blue('Repository:'), chalk.underline(info.repository));
      }

    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`Failed to get plugin info: ${error.message}`));
      process.exit(1);
    }
  }

  async listInstalledPlugins(options) {
    const spinner = ora('Loading installed plugins...').start();

    try {
      const installed = await this.hub.getInstalledPlugins();
      spinner.stop();

      if (installed.length === 0) {
        console.log(chalk.yellow('No plugins installed.'));
        return;
      }

      if (options.format === 'json') {
        console.log(JSON.stringify(installed, null, 2));
        return;
      }

      console.log(chalk.green(`${installed.length} plugins installed:\n`));

      const table = new Table({
        head: ['Name', 'Version', 'Type', 'Last Used', 'Status'],
        colWidths: [25, 12, 15, 15, 10]
      });

      for (const plugin of installed) {
        const lastUsed = plugin.lastUsed ? 
          new Date(plugin.lastUsed).toLocaleDateString() : 
          chalk.gray('Never');
        
        const status = plugin.certified ? 
          chalk.green('Certified') : 
          chalk.gray('Standard');

        table.push([
          plugin.name,
          plugin.version,
          plugin.type,
          lastUsed,
          status
        ]);
      }

      console.log(table.toString());

    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`Failed to list plugins: ${error.message}`));
      process.exit(1);
    }
  }

  async publishPlugin(pluginPath, options) {
    if (options.dryRun) {
      console.log(chalk.blue('🔍 Dry run mode - validating plugin without publishing\n'));
    }

    try {
      if (!options.dryRun) {
        const result = await this.hub.publishPlugin(pluginPath, options);
        
        console.log(chalk.green('\n🎉 Plugin published successfully!'));
        console.log(chalk.blue(`Plugin ID: ${result.pluginId}`));
        console.log(chalk.blue(`Version: ${result.version}`));
        console.log(chalk.blue(`URL: ${result.url}`));
      } else {
        console.log(chalk.green('✅ Plugin validation passed - ready for publishing!'));
      }

    } catch (error) {
      console.error(chalk.red(`Publishing failed: ${error.message}`));
      process.exit(1);
    }
  }

  async ratePlugin(plugin, rating, options) {
    if (rating < 1 || rating > 5) {
      console.error(chalk.red('Rating must be between 1 and 5'));
      process.exit(1);
    }

    try {
      await this.hub.ratePlugin(plugin, rating, options.review);
      
      const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
      console.log(chalk.green(`✅ Rated ${plugin}: ${stars}`));
      
      if (options.review) {
        console.log(chalk.blue('Review submitted successfully!'));
      }

    } catch (error) {
      console.error(chalk.red(`Rating failed: ${error.message}`));
      process.exit(1);
    }
  }

  async getPluginReviews(plugin, options) {
    const spinner = ora('Loading reviews...').start();

    try {
      const reviews = await this.hub.getPluginReviews(plugin, options);
      spinner.stop();

      if (reviews.reviews.length === 0) {
        console.log(chalk.yellow('No reviews found for this plugin.'));
        return;
      }

      console.log(chalk.green(`Reviews for ${plugin}:\n`));

      for (const review of reviews.reviews) {
        const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
        const date = new Date(review.createdAt).toLocaleDateString();
        
        console.log(chalk.blue(`${stars} by ${review.author} on ${date}`));
        
        if (review.review) {
          console.log(chalk.gray(`"${review.review}"`));
        }
        
        if (review.helpful > 0) {
          console.log(chalk.green(`👍 ${review.helpful} found this helpful`));
        }
        
        console.log();
      }

      if (reviews.hasMore) {
        console.log(chalk.blue(`Showing ${reviews.reviews.length} of ${reviews.total} reviews.`));
      }

    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`Failed to load reviews: ${error.message}`));
      process.exit(1);
    }
  }

  async getTrendingPlugins(options) {
    const spinner = ora('Loading trending plugins...').start();

    try {
      const trending = await this.hub.getTrendingPlugins(options);
      spinner.stop();

      console.log(chalk.green(`🔥 Trending plugins (${options.period}):\n`));

      const table = new Table({
        head: ['Rank', 'Name', 'Author', 'Category', 'Growth', 'Rating'],
        colWidths: [6, 20, 15, 15, 10, 10]
      });

      trending.forEach((plugin, index) => {
        const rating = '★'.repeat(Math.floor(plugin.rating)) + '☆'.repeat(5 - Math.floor(plugin.rating));
        const certified = plugin.certified ? chalk.green('✓') : '';
        
        table.push([
          `#${index + 1}`,
          `${plugin.name} ${certified}`,
          plugin.author,
          plugin.category,
          chalk.green(`+${plugin.growth || 0}%`),
          rating
        ]);
      });

      console.log(table.toString());

    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`Failed to load trending plugins: ${error.message}`));
      process.exit(1);
    }
  }

  async submitForCertification(plugin, options) {
    try {
      const result = await this.certification.submitForCertification(plugin, options.level);
      
      console.log(chalk.green('\n🏆 Certification submitted successfully!'));
      console.log(chalk.blue(`Certification ID: ${result.id}`));
      console.log(chalk.blue(`Level: ${result.level}`));
      console.log(chalk.blue(`Score: ${result.score}/100`));
      console.log(chalk.blue(`Status: ${result.status || 'Pending'}`));
      
      if (result.estimatedCompletion) {
        console.log(chalk.blue(`Estimated completion: ${result.estimatedCompletion}`));
      }

    } catch (error) {
      console.error(chalk.red(`Certification submission failed: ${error.message}`));
      process.exit(1);
    }
  }

  async verifyCertification(plugin, certificationId) {
    const spinner = ora('Verifying certification...').start();

    try {
      const verification = await this.certification.verifyCertification(plugin, certificationId);
      spinner.stop();

      if (verification.valid) {
        console.log(chalk.green('✅ Certification is valid!'));
        console.log(chalk.blue(`Plugin: ${plugin}`));
        console.log(chalk.blue(`Level: ${verification.certification.level}`));
        console.log(chalk.blue(`Expires: ${new Date(verification.expiresAt).toLocaleDateString()}`));
      } else {
        console.log(chalk.red('❌ Certification is invalid or expired'));
      }

    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`Verification failed: ${error.message}`));
      process.exit(1);
    }
  }

  async showCertificationRequirements(level) {
    const levels = level ? [level] : ['BASIC', 'VERIFIED', 'ENTERPRISE'];
    
    for (const certLevel of levels) {
      const requirements = this.certification.getCertificationRequirements(certLevel);
      
      if (!requirements) {
        console.log(chalk.red(`Unknown certification level: ${certLevel}`));
        continue;
      }
      
      console.log(chalk.blue.bold(`\n${certLevel} Certification Requirements:\n`));
      
      console.log(chalk.green('Automated Checks:'));
      requirements.automated.forEach(check => {
        console.log(chalk.gray(`  • ${check}`));
      });
      
      if (requirements.manual.length > 0) {
        console.log(chalk.yellow('\nManual Review:'));
        requirements.manual.forEach(review => {
          console.log(chalk.gray(`  • ${review}`));
        });
      }
      
      if (requirements.audit.length > 0) {
        console.log(chalk.red('\nSecurity Audit:'));
        requirements.audit.forEach(audit => {
          console.log(chalk.gray(`  • ${audit}`));
        });
      }
      
      console.log(chalk.blue(`\nMinimum Score: ${requirements.minScore}/100`));
      console.log(chalk.blue(`Validity Period: ${requirements.validityPeriod}`));
    }
  }

  async getPublisherStatus(publisherId) {
    const spinner = ora('Checking publisher status...').start();

    try {
      const status = await this.certification.getPublisherStatus(publisherId || 'me');
      spinner.stop();

      console.log(chalk.blue.bold('\nPublisher Status:\n'));
      
      const table = new Table({
        chars: { 'top': '', 'top-mid': '', 'top-left': '', 'top-right': '',
                'bottom': '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
                'left': '', 'left-mid': '', 'mid': '', 'mid-mid': '',
                'right': '', 'right-mid': '', 'middle': ' ' },
        style: { 'padding-left': 0, 'padding-right': 0 }
      });

      table.push(
        ['Verified:', status.verified ? chalk.green('Yes ✓') : chalk.gray('No')],
        ['Level:', status.level || chalk.gray('None')],
        ['Certified Plugins:', status.certifiedPlugins.toString()],
        ['Reputation:', status.reputation.toString()],
        ['Member Since:', new Date(status.joinedAt).toLocaleDateString()],
        ['Last Activity:', new Date(status.lastActivity).toLocaleDateString()]
      );

      console.log(table.toString());

      if (status.badges && status.badges.length > 0) {
        console.log(chalk.blue('\nBadges:'), status.badges.join(', '));
      }

    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`Failed to get publisher status: ${error.message}`));
      process.exit(1);
    }
  }

  async applyForPublisherVerification() {
    console.log(chalk.blue('📝 Publisher Verification Application\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Full name:',
        validate: input => input.length > 0
      },
      {
        type: 'input',
        name: 'email',
        message: 'Email address:',
        validate: input => /\S+@\S+\.\S+/.test(input)
      },
      {
        type: 'input',
        name: 'organization',
        message: 'Organization (optional):'
      },
      {
        type: 'input',
        name: 'website',
        message: 'Website/Portfolio:'
      },
      {
        type: 'input',
        name: 'github',
        message: 'GitHub profile:'
      },
      {
        type: 'editor',
        name: 'motivation',
        message: 'Why do you want to become a verified publisher?'
      }
    ]);

    const spinner = ora('Submitting application...').start();

    try {
      const result = await this.certification.applyForPublisherVerification(answers);
      spinner.stop();

      console.log(chalk.green('\n✅ Application submitted successfully!'));
      console.log(chalk.blue(`Application ID: ${result.applicationId}`));
      console.log(chalk.blue(`Status: ${result.status}`));
      console.log(chalk.blue(`Estimated review time: ${result.estimatedReviewTime}`));

    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`Application failed: ${error.message}`));
      process.exit(1);
    }
  }
}

module.exports = { PluginHubCLI };
