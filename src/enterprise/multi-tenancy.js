/**
 * Enterprise Multi-tenancy Support
 * Isolated workspaces, resource quotas, and tenant management
 */

const fs = require('fs').promises;
// eslint-disable-line global-require
const path = require('path');
// eslint-disable-line global-require
const crypto = require('crypto');
// eslint-disable-line global-require
const { EventEmitter } = require('events');
// eslint-disable-line global-require

class TenantManager extends EventEmitter {
  constructor(_options = {}) {
    super();

    this._config = {
      dataDir: _options.dataDir || path.join(process.cwd(), '.rag-enterprise'),
      defaultQuotas: {
        maxUsers: 100,
        maxWorkspaces: 10,
        maxStorageGB: 50,
        maxAPICallsPerMonth: 100000,
        maxConcurrentPipelines: 5,
        maxPlugins: 50,
      },
      isolation: {
        networkIsolation: true,
        storageIsolation: true,
        resourceIsolation: true,
      },
      ..._options,
    };

    this.tenants = new Map();
    this.workspaces = new Map();
    this.resourceMonitor = new ResourceMonitor(this._config);
  }

  /**
   * Create a new tenant with isolated resources
   */
  async createTenant(tenantData) {
    const _tenantId = crypto.randomUUID();

    const tenant = {
      id: _tenantId,
      name: tenantData.name,
      domain: tenantData.domain,
      plan: tenantData.plan || 'enterprise',
      quotas: { ...this._config.defaultQuotas, ...tenantData.quotas },
      settings: {
        ssoEnabled: tenantData.ssoEnabled || false,
        auditLoggingEnabled: true,
        dataGovernanceEnabled: true,
        encryptionAtRest: true,
        ...tenantData.settings,
      },
      metadata: {
        createdAt: new Date().toISOString(),
        createdBy: tenantData.createdBy,
        status: 'active',
        lastActivity: new Date().toISOString(),
      },
      isolation: {
        dataPath: path.join(this._config.dataDir, 'tenants', _tenantId),
        networkNamespace: `tenant-${_tenantId}`,
        resourceLimits: this._calculateResourceLimits(tenantData.plan),
      },
    };

    // Create isolated tenant directory structure
    await this._createTenantInfrastructure(tenant);

    // Initialize tenant-specific services
    await this._initializeTenantServices(tenant);

    this.tenants.set(_tenantId, tenant);

    this.emit('tenant_created', { _tenantId, tenant });

    return tenant;
  }

  /**
   * Create isolated workspace within a tenant
   */
  async createWorkspace(_tenantId, workspaceData) {
    const tenant = this.tenants.get(_tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${_tenantId} not found`);
    }

    // Check workspace quota
    const existingWorkspaces = Array.from(this.workspaces.values()).filter(
      (w) => w.tenantId === _tenantId,
    );

    if (existingWorkspaces.length >= tenant.quotas.maxWorkspaces) {
      throw new Error(`Workspace quota exceeded for tenant ${_tenantId}`);
    }

    const _workspaceId = crypto.randomUUID();

    const workspace = {
      id: _workspaceId,
      _tenantId,
      name: workspaceData.name,
      description: workspaceData.description,
      settings: {
        privacy: workspaceData.privacy || 'private',
        collaborationEnabled: workspaceData.collaborationEnabled || false,
        pluginsEnabled: workspaceData.pluginsEnabled || true,
        ...workspaceData.settings,
      },
      resources: {
        storageUsedMB: 0,
        apiCallsThisMonth: 0,
        activePipelines: 0,
        installedPlugins: 0,
      },
      isolation: {
        dataPath: path.join(
          tenant.isolation.dataPath,
          'workspaces',
          _workspaceId,
        ),
        configPath: path.join(
          tenant.isolation.dataPath,
          'workspaces',
          _workspaceId,
          '.ragrc.json',
        ),
        pluginsPath: path.join(
          tenant.isolation.dataPath,
          'workspaces',
          _workspaceId,
          'plugins',
        ),
      },
      metadata: {
        createdAt: new Date().toISOString(),
        createdBy: workspaceData.createdBy,
        lastActivity: new Date().toISOString(),
        version: '1.0.0',
      },
    };

    // Create isolated workspace infrastructure
    await this._createWorkspaceInfrastructure(workspace);

    this.workspaces.set(_workspaceId, workspace);

    this.emit('workspace_created', { _tenantId, _workspaceId, workspace });

    return workspace;
  }

  /**
   * Get tenant with resource usage
   */
  async getTenant(_tenantId) {
    const tenant = this.tenants.get(_tenantId);
    if (!tenant) {
      return null;
    }

    // Get current resource usage
    const usage = await this.resourceMonitor.getTenantUsage(_tenantId);

    return {
      ...tenant,
      usage,
      quotaUtilization: this._calculateQuotaUtilization(tenant.quotas, usage),
    };
  }

  /**
   * List workspaces for a tenant
   */
  async getWorkspaces(_tenantId, _options = {}) {
    const workspaces = Array.from(this.workspaces.values()).filter(
      (w) => w._tenantId === _tenantId,
    );

    if (_options.includeUsage) {
      for (const workspace of workspaces) {
        workspace.usage = await this.resourceMonitor.getWorkspaceUsage(
          workspace.id,
        );
      }
    }

    return workspaces;
  }

  /**
   * Update tenant quotas
   */
  async updateTenantQuotas(_tenantId, newQuotas) {
    const tenant = this.tenants.get(_tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${_tenantId} not found`);
    }

    const oldQuotas = { ...tenant.quotas };
    tenant.quotas = { ...tenant.quotas, ...newQuotas };
    tenant.metadata.lastUpdated = new Date().toISOString();

    // Persist changes
    await this._persistTenant(tenant);

    this.emit('tenant_quotas_updated', {
      _tenantId,
      oldQuotas,
      newQuotas: tenant.quotas,
    });

    return tenant;
  }

  /**
   * Enforce resource quotas
   */
  async enforceQuotas(_tenantId, operation, resourceType, amount) {
    const tenant = this.tenants.get(_tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${_tenantId} not found`);
    }

    const usage = await this.resourceMonitor.getTenantUsage(_tenantId);

    switch (resourceType) {
      case 'storage':
        if (usage.storageUsedGB + amount / 1024 > tenant.quotas.maxStorageGB) {
          throw new Error(`Storage quota exceeded for tenant ${_tenantId}`);
        }
        break;

      case 'apiCalls':
        if (
          usage.apiCallsThisMonth + amount >
          tenant.quotas.maxAPICallsPerMonth
        ) {
          throw new Error(`API calls quota exceeded for tenant ${_tenantId}`);
        }
        break;

      case 'concurrentPipelines':
        if (usage.activePipelines >= tenant.quotas.maxConcurrentPipelines) {
          throw new Error(
            `Concurrent pipelines quota exceeded for tenant ${_tenantId}`,
          );
        }
        break;

      case 'plugins':
        if (usage.installedPlugins >= tenant.quotas.maxPlugins) {
          throw new Error(`Plugins quota exceeded for tenant ${_tenantId}`);
        }
        break;
    }

    return true;
  }

  /**
   * Delete tenant and all associated data
   */
  async deleteTenant(_tenantId, _options = {}) {
    const tenant = this.tenants.get(_tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${_tenantId} not found`);
    }

    // Soft delete by default for compliance
    if (!_options.hardDelete) {
      tenant.metadata.status = 'deleted';
      tenant.metadata.deletedAt = new Date().toISOString();
      tenant.metadata.deletedBy = _options.deletedBy;

      await this._persistTenant(tenant);

      this.emit('tenant_soft_deleted', { _tenantId, tenant });
      return { deleted: true, hardDelete: false };
    }

    // Hard delete - remove all data
    const workspaces = Array.from(this.workspaces.values()).filter(
      (w) => w.tenantId === _tenantId,
    );

    for (const workspace of workspaces) {
      await this.deleteWorkspace(workspace.id, { hardDelete: true });
    }

    // Remove tenant data directory
    await fs.rmdir(tenant.isolation.dataPath, { recursive: true });

    this.tenants.delete(_tenantId);

    this.emit('tenant_hard_deleted', { _tenantId });
    return { deleted: true, hardDelete: true };
  }

  /**
   * Delete workspace
   */
  async deleteWorkspace(_workspaceId, _options = {}) {
    const workspace = this.workspaces.get(_workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${_workspaceId} not found`);
    }

    if (!_options.hardDelete) {
      workspace.metadata.status = 'deleted';
      workspace.metadata.deletedAt = new Date().toISOString();
      workspace.metadata.deletedBy = _options.deletedBy;

      await this._persistWorkspace(workspace);

      this.emit('workspace_soft_deleted', { _workspaceId, workspace });
      return { deleted: true, hardDelete: false };
    }

    // Hard delete
    await fs.rmdir(workspace.isolation.dataPath, { recursive: true });
    this.workspaces.delete(_workspaceId);

    this.emit('workspace_hard_deleted', { _workspaceId });
    return { deleted: true, hardDelete: true };
  }

  // Private methods
  async _createTenantInfrastructure(tenant) {
    const tenantDir = tenant.isolation.dataPath;

    await fs.mkdir(tenantDir, { recursive: true });
    await fs.mkdir(path.join(tenantDir, 'workspaces'), { recursive: true });
    await fs.mkdir(path.join(tenantDir, 'audit-logs'), { recursive: true });
    await fs.mkdir(path.join(tenantDir, 'backups'), { recursive: true });

    // Create tenant configuration
    const tenantConfig = {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        domain: tenant.domain,
      },
      quotas: tenant.quotas,
      settings: tenant.settings,
    };

    await fs.writeFile(
      path.join(tenantDir, 'tenant.json'),
      JSON.stringify(tenantConfig, null, 2),
    );
  }

  async _createWorkspaceInfrastructure(workspace) {
    const workspaceDir = workspace.isolation.dataPath;

    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(workspace.isolation.pluginsPath, { recursive: true });
    await fs.mkdir(path.join(workspaceDir, 'data'), { recursive: true });
    await fs.mkdir(path.join(workspaceDir, 'cache'), { recursive: true });

    // Create default .ragrc.json for workspace
    const defaultConfig = {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        tenantId: workspace._tenantId,
      },
      plugins: {},
      settings: workspace.settings,
    };

    await fs.writeFile(
      workspace.isolation.configPath,
      JSON.stringify(defaultConfig, null, 2),
    );
  }

  async _initializeTenantServices(tenant) {
    // Initialize tenant-specific services
    // This would include setting up isolated databases, message queues, etc.

    // For now, we'll create service configuration files
    const servicesConfig = {
      database: {
        connectionString: `tenant_${tenant.id}_db`,
        isolation: true,
      },
      cache: {
        namespace: `tenant:${tenant.id}`,
        isolation: true,
      },
      messaging: {
        topic: `tenant-${tenant.id}`,
        isolation: true,
      },
    };

    await fs.writeFile(
      path.join(tenant.isolation.dataPath, 'services.json'),
      JSON.stringify(servicesConfig, null, 2),
    );
  }

  _calculateResourceLimits(plan) {
    const limits = {
      starter: {
        cpu: '1000m',
        memory: '2Gi',
        storage: '10Gi',
      },
      professional: {
        cpu: '2000m',
        memory: '4Gi',
        storage: '50Gi',
      },
      enterprise: {
        cpu: '4000m',
        memory: '8Gi',
        storage: '200Gi',
      },
    };

    return limits[plan] || limits.enterprise;
  }

  _calculateQuotaUtilization(quotas, usage) {
    return {
      users: (usage.activeUsers / quotas.maxUsers) * 100,
      workspaces: (usage.workspaces / quotas.maxWorkspaces) * 100,
      storage: (usage.storageUsedGB / quotas.maxStorageGB) * 100,
      apiCalls: (usage.apiCallsThisMonth / quotas.maxAPICallsPerMonth) * 100,
      pipelines: (usage.activePipelines / quotas.maxConcurrentPipelines) * 100,
      plugins: (usage.installedPlugins / quotas.maxPlugins) * 100,
    };
  }

  async _persistTenant(tenant) {
    const tenantFile = path.join(tenant.isolation.dataPath, 'tenant.json');
    await fs.writeFile(tenantFile, JSON.stringify(tenant, null, 2));
  }

  async _persistWorkspace(workspace) {
    const workspaceFile = path.join(
      workspace.isolation.dataPath,
      'workspace.json',
    );
    await fs.writeFile(workspaceFile, JSON.stringify(workspace, null, 2));
  }
}

class ResourceMonitor {
  constructor(_config) {
    this._config = _config;
    this.metrics = new Map();
  }

  async getTenantUsage(_tenantId) {
    // Mock implementation - would integrate with actual monitoring systems
    return {
      activeUsers: Math.floor(Math.random() * 50),
      workspaces: Math.floor(Math.random() * 5),
      storageUsedGB: Math.floor(Math.random() * 30),
      apiCallsThisMonth: Math.floor(Math.random() * 50000),
      activePipelines: Math.floor(Math.random() * 3),
      installedPlugins: Math.floor(Math.random() * 20),
      lastUpdated: new Date().toISOString(),
    };
  }

  async getWorkspaceUsage(_workspaceId) {
    // Mock implementation
    return {
      storageUsedMB: Math.floor(Math.random() * 1000),
      apiCallsThisMonth: Math.floor(Math.random() * 5000),
      activePipelines: Math.floor(Math.random() * 2),
      installedPlugins: Math.floor(Math.random() * 10),
      lastActivity: new Date().toISOString(),
    };
  }
}

module.exports = {
  TenantManager,
  ResourceMonitor,
};

// Ensure module.exports is properly defined
