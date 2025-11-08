// @ts-check

/**
 * Sidebar configuration for RAG Pipeline Utils documentation site
 * Version: 2.0.0
 * Author: Ali Kahwaji
 * Updated: Structured for modular clarity and DX
 * @type {import('@docusaurus/plugin-content-docs').SidebarsConfig}
 */

const sidebars = {
  tutorialSidebar: [
    {
      type: "category",
      label: "Overview",
      collapsed: false,
      items: ["Introduction", "Architecture", "Tutorials", "Use-Cases"],
    },
    {
      type: "category",
      label: "Developer Guide",
      collapsed: false,
      items: [
        "Usage",
        "CLI",
        "API-Reference",
        "Examples",
        "Interactive-Tools",
        "Plugins",
      ],
    },
    {
      type: "category",
      label: "Enterprise",
      collapsed: false,
      items: ["Enterprise", "Observability", "Security"],
    },
    {
      type: "category",
      label: "Deployment",
      collapsed: true,
      items: [
        "Deployment-Docker",
        "Deployment-Kubernetes",
        "Deployment-AWS",
        "Deployment-Azure",
        "Deployment-GCP",
      ],
    },
    {
      type: "category",
      label: "Advanced",
      collapsed: true,
      items: [
        "Evaluation",
        "Performance",
        "Migration",
        "Troubleshooting",
        "FAQ",
      ],
    },
    {
      type: "link",
      label: "Blog",
      href: "/blog",
    },
  ],
};

module.exports = sidebars;
