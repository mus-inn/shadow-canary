import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import rehypeMermaid from 'rehype-mermaid';

export default defineConfig({
  site: 'https://mus-inn.github.io',
  base: '/shadow-canary',
  integrations: [
    starlight({
      title: 'shadow-canary',
      description: 'Shadow-permanent 1% + SLO-gated canary for Next.js on Vercel.',
      logo: {
        src: './public/favicon.svg',
      },
      favicon: '/favicon.svg',
      defaultLocale: 'en',
      locales: {
        root: {
          label: 'English',
          lang: 'en',
        },
      },
      customCss: ['./src/styles/custom.css'],
      social: {
        github: 'https://github.com/mus-inn/shadow-canary',
      },
      editLink: {
        baseUrl: 'https://github.com/mus-inn/shadow-canary/edit/master/docs/',
      },
      sidebar: [
        { label: 'Quickstart', link: '/quickstart/' },
        {
          label: 'Concepts',
          items: [
            { label: 'Shadow vs Canary', link: '/concepts/shadow-vs-canary/' },
            { label: 'Routing', link: '/concepts/routing/' },
            { label: 'Edge Config', link: '/concepts/edge-config/' },
          ],
        },
        {
          label: 'Install',
          items: [
            { label: 'Prerequisites', link: '/install/prerequisites/' },
            {
              label: 'Via Claude Code',
              link: '/install/via-claude-code/',
              badge: { text: 'AI-first', variant: 'tip' },
            },
            { label: 'Via template', link: '/install/via-template/' },
            { label: 'Migration (manual)', link: '/install/migration-manual/' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Workflows', link: '/reference/workflows/' },
            { label: 'Admin API', link: '/reference/admin-api/' },
            { label: 'Dashboard', link: '/reference/dashboard/' },
            { label: 'SLO integration', link: '/reference/slo-integration/' },
          ],
        },
        {
          label: 'Ops',
          items: [
            { label: 'Troubleshooting', link: '/ops/troubleshooting/' },
            { label: 'Changelog', link: '/ops/changelog/' },
          ],
        },
      ],
    }),
  ],
  markdown: {
    rehypePlugins: [
      [rehypeMermaid, { strategy: 'pre-mermaid' }],
    ],
  },
});
