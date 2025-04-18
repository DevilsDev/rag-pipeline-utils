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
      type: 'category',
      label: 'Overview',
      collapsed: false,
      items: ['Introduction', 'Architecture', 'Tutorials', 'Use-Cases'],
    },
    {
      type: 'category',
      label: 'Developer Guide',
      collapsed: false,
      items: ['Usage', 'CLI', 'Plugins'],
    },
    {
      type: 'category',
      label: 'Advanced',
      collapsed: true,
      items: ['Evaluation', 'FAQ'],
    },
    {
      type: 'link',
      label: '📰 Blog',
      href: '/blog',
    },    
  ],
};

export default sidebars;
