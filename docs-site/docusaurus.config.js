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
const { themes: prismThemes } = require("prism-react-renderer");
const { accessiblePrismTheme } = require("./src/lib/accessiblePrismTheme");
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
    // ```mermaid code blocks render as diagrams (theme-mermaid below).
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },
  trailingSlash: false,

  favicon: "img/favicon.svg",
  headTags: [
    {
      tagName: "link",
      attributes: {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/rag-pipeline-utils/img/favicon-32.png",
      },
    },
    {
      tagName: "link",
      attributes: {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/rag-pipeline-utils/img/apple-touch-icon.png",
      },
    },
  ],

  // GitHub Pages deployment config
  organizationName: "DevilsDev",
  projectName: "rag-pipeline-utils",

  // Read by the homepage hero.
  customFields: { version: PKG_VERSION },

  // Fonts are self-hosted; see src/fonts.js.
  clientModules: [require.resolve("./src/fonts.js")],

  plugins: [
    [
      // /llms.txt (an index) and /llms-full.txt (every docs page as plain
      // Markdown) for AI coding assistants; see https://llmstxt.org.
      "docusaurus-plugin-llms",
      {
        docsDir: "docs",
        includeBlog: false,
        excludeImports: true,
        removeDuplicateHeadings: true,
        // The config builder is interactive; its page has nothing to read.
        ignoreFiles: ["Config-Builder.mdx"],
        includeOrder: [
          "Introduction.md",
          "Usage.md",
          "API-Reference.md",
          "CLI.md",
          "Concepts-*.md",
          "Evaluation.md",
          "Plugins.md",
          "Examples.md",
          "Use-Cases.md",
          "Security*.md",
          "Experimental.md",
          "Migration.md",
          "Troubleshooting.md",
          "FAQ.md",
        ],
        includeUnmatchedLast: true,
        rootContent:
          "Composable RAG for Node.js. Install with `npm install @devilsdev/rag-pipeline-utils`. The package is CommonJS and ESM with TypeScript types; classes under `@devilsdev/rag-pipeline-utils/experimental` are simulated or incomplete and not for production.",
        fullRootContent:
          "Composable RAG for Node.js. Install with `npm install @devilsdev/rag-pipeline-utils`. The package is CommonJS and ESM with TypeScript types; classes under `@devilsdev/rag-pipeline-utils/experimental` are simulated or incomplete and not for production.",
      },
    ],
  ],

  themes: [
    "@docusaurus/theme-mermaid",
    [
      // Local search: the index is built with the site, so it needs no
      // external service or API key. Open it with Ctrl+K / Cmd+K.
      require.resolve("@easyops-cn/docusaurus-search-local"),
      {
        hashed: true,
        indexBlog: true,
        docsRouteBasePath: "/docs",
        highlightSearchTermsOnTargetPage: true,
        searchBarShortcutHint: true,
        explicitSearchResultPath: true,
      },
    ],
  ],

  themeConfig: {
    metadata: [
      {
        name: "keywords",
        content:
          "rag, retrieval-augmented generation, llm, nodejs, citations, evaluation, guardrails",
      },
      { name: "author", content: "Ali Kahwaji" },
      { name: "theme-color", content: "#0b1020" },
    ],
    // Open Graph / Twitter card, generated from assets/banner.svg.
    image: "img/social-card.png",

    colorMode: {
      defaultMode: "light",
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },

    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: true,
      },
    },

    mermaid: {
      theme: { light: "neutral", dark: "dark" },
    },

    prism: {
      // Token colours raised to WCAG AA (4.5:1) against each background.
      theme: accessiblePrismTheme(prismThemes.github),
      darkTheme: accessiblePrismTheme(prismThemes.oneDark),
      additionalLanguages: ["bash", "json", "yaml", "diff"],
    },

    navbar: {
      title: "rag-pipeline-utils",
      hideOnScroll: false,
      logo: {
        // Decorative: the site name is shown next to it.
        alt: "",
        src: "img/logo.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "tutorialSidebar",
          position: "left",
          label: "Docs",
        },
        { to: "/docs/API-Reference", label: "API", position: "left" },
        { to: "/docs/CLI", label: "CLI", position: "left" },
        { to: "/docs/Examples", label: "Examples", position: "left" },
        { to: "/blog", label: "Blog", position: "left" },
        {
          // Only the current version is published; older snapshots were
          // removed from the menu because they documented APIs that never
          // existed. The label links to the release notes.
          href: `https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v${PKG_VERSION}`,
          label: `v${PKG_VERSION}`,
          position: "left",
          className: "rag-version",
        },
        { type: "search", position: "right" },
        {
          href: "https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils",
          label: "npm",
          position: "right",
        },
        {
          href: "https://github.com/DevilsDev/rag-pipeline-utils",
          position: "right",
          className: "header-github-link",
          "aria-label": "GitHub repository",
        },
      ],
    },

    footer: {
      style: "dark",
      links: [
        {
          title: "Learn",
          items: [
            { label: "Introduction", to: "/docs/Introduction" },
            { label: "Tutorials", to: "/docs/Tutorials" },
            { label: "Use cases", to: "/docs/Use-Cases" },
            { label: "Comparison", to: "/docs/Comparison" },
          ],
        },
        {
          title: "Reference",
          items: [
            { label: "API reference", to: "/docs/API-Reference" },
            { label: "CLI reference", to: "/docs/CLI" },
            { label: "Plugins", to: "/docs/Plugins" },
            { label: "Migration", to: "/docs/Migration" },
            { label: "Config builder", to: "/docs/Config-Builder" },
            {
              // Plain-text docs for AI coding assistants (llmstxt.org).
              label: "llms.txt",
              href: "https://devilsdev.github.io/rag-pipeline-utils/llms.txt",
            },
          ],
        },
        {
          title: "Production",
          items: [
            { label: "Guardrails", to: "/docs/Concepts-Guardrails" },
            { label: "Evaluation", to: "/docs/Evaluation" },
            { label: "Security", to: "/docs/Security" },
            { label: "Experimental modules", to: "/docs/Experimental" },
          ],
        },
        {
          title: "Project",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/DevilsDev/rag-pipeline-utils",
            },
            {
              label: "Discussions",
              href: "https://github.com/DevilsDev/rag-pipeline-utils/discussions",
            },
            { label: "Changelog", to: "/docs/Changelog" },
            { label: "Blog", to: "/blog" },
          ],
        },
      ],
      copyright: `MIT licensed · © ${new Date().getFullYear()} Ali Kahwaji`,
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
