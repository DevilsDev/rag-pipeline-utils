/**
 * TypeDoc plugin for the generated API reference (npm run docs:api).
 *
 * 1. Leaves `_underscored` members out. The declarations are emitted from
 *    JavaScript, where a leading underscore marks a member as internal but
 *    tsc still declares it public, so pages would list fields such as
 *    QdrantRetriever._apiKey.
 * 2. Marks every page as plain Markdown for Docusaurus. Its default MDX
 *    parser reads `<a|b>` or `{...}` in comment text as JSX and fails.
 */

const { Converter, ReflectionKind } = require("typedoc");
const { MarkdownPageEvent } = require("typedoc-plugin-markdown");

const MEMBER_KINDS =
  ReflectionKind.Property | ReflectionKind.Method | ReflectionKind.Accessor;

const FRONT_MATTER = "---\nmdx:\n  format: md\n---\n\n";

exports.load = function load(app) {
  app.converter.on(Converter.EVENT_RESOLVE_BEGIN, (context) => {
    const hidden = context.project
      .getReflectionsByKind(MEMBER_KINDS)
      .filter((reflection) => reflection.name.startsWith("_"));
    for (const reflection of hidden) {
      context.project.removeReflection(reflection);
    }
  });

  app.renderer.on(MarkdownPageEvent.END, (page) => {
    page.contents = FRONT_MATTER + page.contents;
  });
};
