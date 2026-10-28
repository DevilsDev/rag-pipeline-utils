'use strict';

/**
 * Install a plugin into a project and register it in .ragrc.json.
 *
 * Sources: a registry plugin id (needs a PluginHub; the download is verified
 * against the registry's sha256), a local directory, a .tgz / .tar.gz
 * package, a single .js file, or an npm package ("npm:<spec>").
 *
 * Steps: stage the files inside <project>/.rag/plugins, statically scan
 * them (high-risk findings block the install unless allowRisky), check the
 * entry module exposes the stage's required methods (in a separate process),
 * move into place and add `plugins.<stage>.<name>` to the config. Install
 * scripts are never run. Installed plugins run with your privileges when the
 * pipeline uses them; the scan informs that decision, it does not sandbox.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { extractTarGz, isWithin, relativeWithin } = require('./tar-extract');
const { scanPlugin } = require('./plugin-scanner');
const { probeContract, STAGE_METHODS } = require('./plugin-probe');

const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

/** child is strictly inside parent (both resolved paths). */
function isInside(parent, child) {
  return (
    isWithin(parent, child) && path.resolve(parent) !== path.resolve(child)
  );
}

/** Run npm without a shell (on Windows via node + npm-cli.js). */
async function runNpm(args, cwd) {
  const run = promisify(execFile);
  if (process.platform === 'win32') {
    const npmCli = path.join(
      path.dirname(process.execPath),
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js',
    );
    return run(process.execPath, [npmCli, ...args], { cwd, windowsHide: true });
  }
  return run('npm', args, { cwd });
}

/** If extraction produced a single top-level directory (e.g. "package/"), use it. */
function packageRoot(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  if (entries.length === 1 && entries[0].isDirectory()) {
    return path.join(dir, entries[0].name);
  }
  return dir;
}

async function stageSource(source, stagingDir, options) {
  const local = path.resolve(options.cwd || process.cwd(), source);

  if (fs.existsSync(local)) {
    const stat = fs.statSync(local);
    if (stat.isDirectory()) {
      fs.cpSync(local, stagingDir, {
        recursive: true,
        // Skip node_modules and .git at any depth (path is relative to local)
        filter: (src) =>
          !/(^|\/)(node_modules|\.git)(\/|$)/.test(
            relativeWithin(local, src) || '',
          ),
      });
      return { kind: 'directory', root: stagingDir };
    }
    if (/\.(tgz|tar\.gz)$/i.test(local)) {
      extractTarGz(fs.readFileSync(local), stagingDir);
      return { kind: 'tarball', root: packageRoot(stagingDir) };
    }
    if (/\.(c?js)$/i.test(local)) {
      fs.copyFileSync(local, path.join(stagingDir, 'index.js'));
      return { kind: 'file', root: stagingDir };
    }
    throw new Error(
      `Unsupported plugin file: ${source} (expected a directory, .tgz or .js)`,
    );
  }

  if (source.startsWith('npm:')) {
    const spec = source.slice(4);
    const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-npm-'));
    try {
      const { stdout } = await runNpm(
        [
          'pack',
          spec,
          '--silent',
          '--ignore-scripts',
          '--pack-destination',
          packDir,
        ],
        packDir,
      );
      const tarball = path.join(packDir, stdout.trim().split(/\r?\n/).pop());
      extractTarGz(fs.readFileSync(tarball), stagingDir);
      return { kind: 'npm', root: packageRoot(stagingDir) };
    } finally {
      fs.rmSync(packDir, { recursive: true, force: true });
    }
  }

  if (!options.hub) {
    throw new Error(
      `"${source}" is not a local path or npm:<package>, and no plugin registry is configured.`,
    );
  }
  const hub = options.hub;
  const info = await hub.getPluginInfo(source);
  const url = await hub._getDownloadUrl(source, options.version || 'latest');
  const archive = await hub._downloadPlugin(url);
  await hub._verifyPluginIntegrity(archive, info.checksums); // throws on mismatch
  extractTarGz(archive, stagingDir);
  return { kind: 'registry', root: packageRoot(stagingDir), info };
}

/**
 * @param {object} params
 * @param {string} params.source - Registry id, path, .tgz, .js or "npm:<spec>"
 * @param {string} params.configPath - .ragrc.json to register the plugin in
 * @param {string} [params.stage] - Overrides package.json "ragPipeline.stage"
 * @param {string} [params.name] - Overrides package.json "ragPipeline.name"
 * @param {boolean} [params.force] - Replace an installed plugin with the same stage/name
 * @param {boolean} [params.allowRisky] - Install despite high-risk scan findings
 * @param {object} [params.hub] - PluginHub, required for registry ids
 * @param {string} [params.version] - Registry version (default "latest")
 * @param {function} [params.onProgress] - Called with a stage label
 * @returns {Promise<object>} Installation summary
 */
async function installPlugin(params) {
  const progress = params.onProgress || (() => {});
  const configPath = path.resolve(params.configPath);
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Config file not found: ${params.configPath}. Run "rag-pipeline init" first.`,
    );
  }
  const configDir = path.dirname(configPath);
  const pluginsDir = path.join(configDir, '.rag', 'plugins');
  fs.mkdirSync(pluginsDir, { recursive: true });
  const stagingDir = path.join(
    pluginsDir,
    `.staging-${crypto.randomBytes(6).toString('hex')}`,
  );
  fs.mkdirSync(stagingDir);

  try {
    progress('fetching');
    const staged = await stageSource(params.source, stagingDir, {
      hub: params.hub,
      version: params.version,
      cwd: configDir,
    });

    const manifestPath = path.join(staged.root, 'package.json');
    const manifest = fs.existsSync(manifestPath)
      ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      : {};
    const stage = params.stage || manifest.ragPipeline?.stage;
    const name = params.name || manifest.ragPipeline?.name;
    if (!STAGE_METHODS[stage]) {
      throw new Error(
        `Unknown or missing stage. Pass --stage (${Object.keys(STAGE_METHODS).join(', ')}) or set "ragPipeline.stage" in package.json.`,
      );
    }
    if (!name || !NAME_PATTERN.test(name)) {
      throw new Error(
        'Missing or invalid plugin name. Pass --name (letters, digits, ".", "_", "-") or set "ragPipeline.name" in package.json.',
      );
    }

    const entry = path.resolve(staged.root, manifest.main || 'index.js');
    if (!isInside(staged.root, entry) || !fs.existsSync(entry)) {
      throw new Error(
        `Plugin entry file not found: ${manifest.main || 'index.js'}`,
      );
    }

    progress('scanning');
    const scan = scanPlugin(staged.root);
    if (scan.counts.high > 0 && !params.allowRisky) {
      const error = new Error(
        `Security scan found ${scan.counts.high} high-risk finding(s); not installed. Review them and re-run with --allow-risky to install anyway.`,
      );
      error.scan = scan;
      throw error;
    }

    progress('verifying');
    const probe = await probeContract(entry, stage);
    if (!probe.ok) {
      const reason =
        probe.error || `missing method(s): ${probe.missing.join(', ')}`;
      throw new Error(
        `Plugin does not implement the ${stage} contract: ${reason}`,
      );
    }

    progress('installing');
    const destination = path.join(pluginsDir, `${stage}-${name}`);
    if (fs.existsSync(destination)) {
      if (!params.force) {
        throw new Error(
          `${stage} plugin "${name}" is already installed. Use --force to replace it.`,
        );
      }
      fs.rmSync(destination, { recursive: true, force: true });
    }
    fs.renameSync(staged.root, destination);
    const installedEntry = path.join(
      destination,
      relativeWithin(staged.root, entry),
    );

    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    raw.plugins = raw.plugins || {};
    raw.plugins[stage] = raw.plugins[stage] || {};
    raw.plugins[stage][name] = `./${relativeWithin(configDir, installedEntry)}`;
    fs.writeFileSync(configPath, `${JSON.stringify(raw, null, 2)}\n`);

    return {
      stage,
      name,
      source: staged.kind,
      version: manifest.version || staged.info?.version || null,
      path: destination,
      entry: raw.plugins[stage][name],
      scan,
      methods: probe.methods,
      inPipeline: Array.isArray(raw.pipeline)
        ? raw.pipeline.some((p) => p.stage === stage && p.name === name)
        : false,
    };
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

module.exports = { installPlugin };

/**
 * Plugins registered under `plugins` in a config, with the installed
 * package's version when it lives in .rag/plugins.
 *
 * @param {string} configPath
 * @returns {Array<{stage: string, name: string, entry: string, version: string|null, installed: boolean, inPipeline: boolean, exists: boolean}>}
 */
function listInstalledPlugins(configPath) {
  const absolute = path.resolve(configPath);
  if (!fs.existsSync(absolute)) return [];
  const config = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  const configDir = path.dirname(absolute);
  const pluginsDir = path.join(configDir, '.rag', 'plugins');
  const pipeline = Array.isArray(config.pipeline) ? config.pipeline : [];
  const list = [];

  for (const [stage, plugins] of Object.entries(config.plugins || {})) {
    for (const [name, entry] of Object.entries(plugins || {})) {
      if (typeof entry !== 'string') continue;
      const entryPath = path.resolve(configDir, entry);
      const installedDir = path.join(pluginsDir, `${stage}-${name}`);
      const installed = isInside(installedDir, entryPath);
      let version = null;
      const manifest = path.join(installedDir, 'package.json');
      if (installed && fs.existsSync(manifest)) {
        try {
          version =
            JSON.parse(fs.readFileSync(manifest, 'utf8')).version || null;
        } catch {
          // unreadable manifest: version unknown
        }
      }
      list.push({
        stage,
        name,
        entry,
        version,
        installed,
        exists: fs.existsSync(entryPath),
        inPipeline: pipeline.some((p) => p.stage === stage && p.name === name),
      });
    }
  }
  return list;
}

module.exports.listInstalledPlugins = listInstalledPlugins;
