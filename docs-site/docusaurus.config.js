/**
 * Path: /docs-site/docusaurus.config.js
 * Description: Tailwind integration, sticky navbar, and dark/light toggle support
 * Author: Ali Kahwaji
 *
 * Version source of truth: the root /package.json. Anywhere on this page
 * that needs to display the package version (dropdown label, Algolia
 * facet filter, etc.) reads from PKG_VERSION below — never hardcode.
 */

// @ts-check

const path = require("path");
// Read once at config-load. Docusaurus invokes this file at build time,
// so picking up the version from the root package.json is fine here.
const ROOT_PKG = require(path.resolve(__dirname, "..", "package.json"));
const PKG_VERSION = ROOT_PKG.version;

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "RAG Pipeline Utils",
  // Same wording as the npm package and the README.
  tagline: ROOT_PKG.description,
  url: "https://devilsdev.github.io",
  baseUrl: "/rag-pipeline-utils/",
  deploymentBranch: "gh-pages",
  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },
  trailingSlash: false,

  favicon: "img/favicon.ico",

  // GitHub Pages deployment config
  organizationName: "DevilsDev",
  projectName: "rag-pipeline-utils",

  themeConfig: {
    metadata: [
      {
        name: "keywords",
        content: "rag, llm, langchain, pipeline, openai, nodejs",
      },
      { name: "author", content: "Ali Kahwaji" },
      { name: "theme-color", content: "#2563EB" },
    ],
    // ✅ OpenGraph / Twitter image
    image: "img/social-card.jpg",

    // ✅ Color mode toggle support
    colorMode: {
      defaultMode: "light",
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },

    // ✅ Sticky header
    navbar: {
      title: "RAG Pipeline Utils",
      hideOnScroll: false,
      logo: {
        alt: "RAG Pipeline Utils Logo",
        src: "img/logo.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "tutorialSidebar",
          position: "left",
          label: "Documentation",
        },
        {
          // Only the current version is published; older snapshots were
          // removed from the menu because they documented APIs that never
          // existed. The label links to the release notes.
          href: `https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v${PKG_VERSION}`,
          label: `v${PKG_VERSION}`,
          position: "left",
        },
        { to: "/blog", label: "Blog", position: "left" },
        {
          type: "dropdown",
          label: "Enterprise",
          position: "left",
          items: [
            { to: "/docs/Enterprise", label: "Enterprise Features" },
            { to: "/docs/Observability", label: "Observability" },
            { to: "/docs/Security", label: "Security" },
            { to: "/docs/Performance", label: "Performance" },
          ],
        },
        {
          href: "https://github.com/DevilsDev/rag-pipeline-utils",
          label: "GitHub",
          position: "right",
        },
        {
          href: "https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils",
          label: "npm",
          position: "right",
        },
      ],
    },

    // Algolia DocSearch configuration
    // To enable search:
    // 1. Apply at https://docsearch.algolia.com/apply/
    // 2. Uncomment the configuration below
    // 3. Replace with your API keys
    /*
    algolia: {
      appId: 'YOUR_APP_ID',
      apiKey: 'YOUR_SEARCH_API_KEY',
      indexName: 'rag-pipeline-utils',
      contextualSearch: true,
      searchParameters: {
        facetFilters: ['language:en', `version:${PKG_VERSION}`],
      },
      searchPagePath: 'search',
    },
    */

    footer: {
      style: "dark",
      links: [
        {
          title: "Documentation",
          items: [
            { label: "Getting Started", to: "/docs/Introduction" },
            { label: "Architecture", to: "/docs/Architecture" },
            { label: "CLI Reference", to: "/docs/CLI" },
            { label: "Tutorials", to: "/docs/Tutorials" },
          ],
        },
        {
          title: "Enterprise",
          items: [
            { label: "Enterprise Features", to: "/docs/Enterprise" },
            { label: "Observability", to: "/docs/Observability" },
            { label: "Security", to: "/docs/Security" },
            { label: "Performance", to: "/docs/Performance" },
          ],
        },
        {
          title: "Community",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/DevilsDev/rag-pipeline-utils",
            },
            {
              label: "Issues",
              href: "https://github.com/DevilsDev/rag-pipeline-utils/issues",
            },
            {
              label: "Discussions",
              href: "https://github.com/DevilsDev/rag-pipeline-utils/discussions",
            },
          ],
        },
        {
          title: "More",
          items: [
            { label: "Blog", to: "/blog" },
            {
              label: "npm Package",
              href: "https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils",
            },
            {
              label: "License",
              href: "https://github.com/DevilsDev/rag-pipeline-utils/blob/main/LICENSE",
            },
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} Ali Kahwaji. Built with Docusaurus.`,
    },
  },

  // Google Analytics configuration
  // To enable analytics:
  // 1. Create GA4 property at https://analytics.google.com/
  // 2. Uncomment the configuration below
  // 3. Replace with your measurement ID
  /*
  gtag: {
    trackingID: 'G-XXXXXXXXXX',
    anonymizeIP: true,
  },
  */

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.js",
          lastVersion: "current",
          // versioned_docs/version-2.3.1 is kept on disk until 3.0 but no
          // longer built or listed.
          onlyIncludeVersions: ["current"],
          versions: {
            current: {
              label: PKG_VERSION,
              banner: "none",
            },
          },
        },
        blog: {
          showReadingTime: true,
          blogSidebarTitle: "All Posts",
          blogSidebarCount: "ALL",
          onUntruncatedBlogPosts: "ignore",
        },
        theme: {
          customCss: "./src/css/custom.css",
        },
        sitemap: {
          changefreq: "weekly",
          priority: 0.5,
          ignorePatterns: ["/tags/**"],
          filename: "sitemap.xml",
        },
      },
    ],
  ],
};

module.exports = config;
