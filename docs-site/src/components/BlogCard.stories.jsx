/**
 * Version: 1.0.0
 * File: BlogCard.stories.jsx
 * Description: Storybook entry for BlogCard with image placeholder integration
 * Author: Ali Kahwaji
 */

import React from 'react';
import BlogCard from './BlogCard';

export default {
  title: 'Components/BlogCard',
  component: BlogCard,
  tags: ['autodocs'],
  args: {
    title: 'Composable Pipelines',
    image: 'img/hero.jpg', // Path relative to /static
  },
};

const Template = (args) => <BlogCard {...args} />;

export const Default = Template.bind({});

export const CustomTitle = Template.bind({});
CustomTitle.args = {
  title: 'Flexible RAG Components',
};

export const WithAnotherImage = Template.bind({});
WithAnotherImage.args = {
  title: 'LLM Plugin Architecture',
  image: 'img/social-card.jpg',
};
