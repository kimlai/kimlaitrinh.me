// stolen from https://github.com/hankchizljaw/hylia/blob/28cc5c8fe5698dfa5dbafab818ca441116f989ce/src/filters/date-filter.js
const dateFilter = value => {
  const date = new Date(value);
  const months = [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre"
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
};

module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("public");
  eleventyConfig.addFilter("dateFilter", dateFilter);
  // if we use the .gitignore, then 11ty will ignore changes to the
  // compiled css, which is annoying in dev.
  eleventyConfig.setUseGitIgnore(false);
};
