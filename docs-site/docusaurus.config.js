/**
 * Version: 0.3.0
 * Path: /docs-site/docusaurus.config.js
 * Description: Final production config with cleaned branding and image setup
 * Author: Ali Kahwaji
 */

// @ts-check

export default {
  title: 'RAG Pipeline Utils',
  tagline: 'Composable RAG pipelines with Node.js',
  url: 'https://devilsdev.github.io',
  baseUrl: '/rag-pipeline-utils/',
  deploymentBranch: 'gh-pages',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // ✅ Final favicon and social card for branding
  favicon: 'img/favicon.ico',
  themeConfig: {
    
    // algolia: {
    //   appId: 'YOUR_APP_ID',
    //   apiKey: 'YOUR_PUBLIC_API_KEY',
    //   indexName: 'rag_pipeline_utils',
    //   contextualSearch: true,
    // },
    image: 'img/social-card.jpg',
    navbar: {
      title: 'RAG Utils',
      logo: {
        alt: '', // ✅ Clean alt to avoid raw rendering
        src: '/img/logo.svg'
      },
      items: [
        { to: '/docs/Introduction', label: 'Docs', position: 'left' },
        { to: '/blog', label: 'Blog', position: 'left' },
        { href: 'https://github.com/DevilsDev/rag-pipeline-utils', label: 'GitHub', position: 'right' },
      ]
    },
    footer: {
      style: 'dark',
      copyright: `© ${new Date().getFullYear()} Ali Kahwaji`
    }
  },

  organizationName: 'DevilsDev',
  projectName: 'rag-pipeline-utils',

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: 'https://github.com/DevilsDev/rag-pipeline-utils/edit/main/docs-site/'
        },

        blog: {
          showReadingTime: true,
          editUrl: 'https://github.com/DevilsDev/rag-pipeline-utils/edit/main/docs-site/blog/',
        },
        
        theme: {
          customCss: require.resolve('./src/css/custom.css')
        }
      }
    ]
  ]
};
