// Version: 1.0.0
// Description: Storybook story for BlogImage component
// Author: Ali Kahwaji

import React from 'react';
import BlogImage from '../BlogImage';

export default {
  title: 'Components/BlogImage',
  component: BlogImage,
};

const Template = (args) => <BlogImage {...args} />;

export const Default = Template.bind({});
Default.args = {
  srcKey: 'img_hero',
  alt: 'Default placeholder image',
  className: '',
};
