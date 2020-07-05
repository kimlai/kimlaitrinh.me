const CleanCSS = require("clean-css");

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

module.exports = function(config) {
  config.addPassthroughCopy("public");
  config.addFilter("dateFilter", dateFilter);
  config.addFilter("cssmin", code => new CleanCSS({}).minify(code).styles);
  config.addFilter("stripProtocol", string => string.replace("https://", ""));
  config.addWatchTarget("css");
  config.addCollection("projects", collection =>
    collection
      .getFilteredByGlob("./projects/*.md")
      .sort((a, b) =>
        Number(a.data.displayOrder) > Number(b.data.displayOrder) ? 1 : -1
      )
  );

  const markdownIt = require("markdown-it");
  const markdownItFootnote = require("markdown-it-footnote");
  const markdownLib = markdownIt({ html: true }).use(markdownItFootnote);
  config.setLibrary("md", markdownLib);

  return {
    markdownTemplateEngine: "njk"
  };
};
