/**
 * Combines two selectors into a single selector string, accounting for the '&' character, following the rules specified in the CSS
 * nesting spec: https://www.w3.org/TR/css-nesting-1/#nested-style-rule
 * @param {string} parentSelector The parent selector.
 * @param {string} childSelector The child selector.
 * @returns A combined selector string.
 */
const combineSelectors = (parentSelector, childSelector) => {
  if (childSelector.startsWith('&')) {
    return `${parentSelector}${childSelector.slice(1)}`;
  }

  return `${parentSelector} ${childSelector}`;
};

/**
 * Builds a flattened selector for a given rule, by traversing parent rules, and combining their selectors.
 *
 * This accounts for multiple selectors in both parent/child rules, and uses recursion. Improvements could be made
 * to switch this over to a loop, but this is easier to read and understand.
 *
 * @param {*} rule The rule node, with style declarations, to build a flattened selector for.
 * @returns
 */
const buildFlattenedSelectors = (rule) => {
  // If we have no rule, or no selector, return an empty array.
  if (!rule || !rule.selector) {
    return [];
  }

  // Account for multiple selectors.
  const selectors = rule.selector.split(',').map((selector) => selector.trim());

  // Get our flattened parent selectors - this will be an array, as one or more parent rules in the tree could have multiple selectors.
  const parentSelectors = buildFlattenedSelectors(rule.parent);

  // If we have no parent selectors, return just the current selectors (we've reached the root of the tree).
  if (!parentSelectors || parentSelectors.length === 0) {
    return selectors;
  }

  // For each possible combination of parent and child selectors, add a new combined selector to the final array.
  const combinedSelectors = [];
  parentSelectors.forEach((parentSelector) => {
    selectors.forEach((childSelector) => {
      combinedSelectors.push(combineSelectors(parentSelector, childSelector));
    });
  });

  return combinedSelectors;
};

/**
 * A small PostCSS plugin which unwraps nested CSS selectors, so our compiled CSS modules can be handled by older
 * browsers that don't support them, as well as JSDOM's crappy CSS parser.
 *
 * This is a basic implementation which runs once at the end of all other processing.
 *
 * You may ask why another unwrapping CSS selector plugin. Essentially, it boils down to the fact that this is
 * built to work with the PostCSS modules plugin:
 * - PostCSS modules plugin is responsible for handling the '@compose' rule, which imports other CSS classes.
 * - The PostCSS modules plugin uses the 'OnceExit' hook of the PostCSS pipeline.
 * - Other 'unwrap' plugins hook into the 'Once' and 'Rule' hooks, which is run before the 'OnceExit' hook.
 * - This means that the 'unwrap' plugins run before the '@compose' rule is handled, and therefore miss
 *   nested selectors imported from other files.
 *
 * This plugin essentially flattens nested selectors in a manner similar to SASS.
 */
export const unwrapNestedSelectors = () => ({
  postcssPlugin: 'unwrap-nested-selectors',
  OnceExit(root) {
    // Iterate through all style rules in the AST.
    root.walkRules((rule) => {
      const parentRule = rule.parent;

      // Only unwrap rules that are nested inside other rules, and have some style declarations.
      if (parentRule.type !== 'root' && rule.nodes.some((node) => node.type === 'decl')) {
        const selectorsForRule = buildFlattenedSelectors(rule);

        // Clone the node, append it to the root, and remove the original nested rule.
        root.append(rule.clone({ selector: selectorsForRule.join(',') }));
        rule.remove();
      }

      // If the remaining parent rule(s) in the tree are now empty, remove them as well.
      let currentParent = parentRule;
      while (currentParent && currentParent.type === 'rule') {
        if (currentParent.nodes.length > 0) {
          break;
        }

        const newParent = currentParent.parent;
        currentParent.remove();
        currentParent = newParent;
      }
    });
  },
});

