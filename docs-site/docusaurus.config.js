/**
 * Version: 0.4.0
 * Path: /docs-site/docusaurus.config.js
 * Description: Tailwind integration, sticky navbar, and dark/light toggle support
 * Author: Ali Kahwaji
 */

// @ts-check

export default {
  title: 'RAG Pipeline Utils',
  tagline: 'Composable pipelines for LLMs',
  url: 'https://devilsdev.github.io',
  baseUrl: '/rag-pipeline-utils/',
  deploymentBranch: 'gh-pages',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  favicon: 'img/favicon.ico',

  themeConfig: {
    metadata: [
      { name: 'keywords', content: 'rag, llm, langchain, pipeline, openai, nodejs' },
      { name: 'author', content: 'Ali Kahwaji' },
      { name: 'theme-color', content: '#3EF4B6' }
    ],
    // ✅ OpenGraph / Twitter image
    image: 'img/social-card.jpg',

    // ✅ Color mode toggle support
    colorMode: {
      defaultMode: 'light',
      disableSwitch: false,
      respectPrefersColorScheme: true
    },

    // ✅ Sticky header
    navbar: {
      title: 'RAG Utils',
      hideOnScroll: false,
      logo: {
        alt: '',
        src: '/img/logo.svg'
      },
      items: [
        { to: '/docs/Introduction', label: 'Docs', position: 'left' },
        { to: '/blog', label: 'Blog', position: 'left' },
        {
          href: 'https://github.com/DevilsDev/rag-pipeline-utils',
          label: 'GitHub',
          position: 'right'
        }
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
          editUrl:
            'https://github.com/DevilsDev/rag-pipeline-utils/edit/main/docs-site/'
        },
        blog: {
          showReadingTime: true,
          blogSidebarTitle: 'All Posts',
          blogSidebarCount: 'ALL',
          onUntruncatedBlogPosts: 'ignore',
          editUrl:
            'https://github.com/DevilsDev/rag-pipeline-utils/edit/main/docs-site/blog/'
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css')
        }
      }
    ]
  ]
};
