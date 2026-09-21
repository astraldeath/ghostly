import { createMatcher } from "./rules.js";
let matcher;
self.onmessage = ({ data }) => {
  try {
    if (data.settings) matcher = createMatcher(data.settings);
    self.postMessage({ result: matcher.explain(data.url) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
